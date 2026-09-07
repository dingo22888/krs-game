import { test } from 'node:test';
import assert from 'node:assert/strict';
import route from '../api/house-model.ts';
import auth from '../api/auth.ts';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';

test('authenticated model API uses the real Blob SDK with request-context OIDC', async t => {
  const names = ['HOUSE_MODEL_URL', 'GAME_PASSWORD', 'GAME_AUTH_SECRET', 'BLOB_STORE_ID', 'VERCEL_OIDC_TOKEN', 'BLOB_READ_WRITE_TOKEN'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const contextSymbol = Symbol.for('@vercel/request-context');
  const oldContext = globalThis[contextSymbol];
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    if (oldContext === undefined) delete globalThis[contextSymbol];
    else globalThis[contextSymbol] = oldContext;
  });
  for (const name of names) delete process.env[name];
  const url = 'https://fixture.private.blob.vercel-storage.com/model.json';
  process.env.HOUSE_MODEL_URL = url;
  process.env.GAME_PASSWORD = 'local-test-password';
  process.env.GAME_AUTH_SECRET = 'local-test-secret';
  process.env.BLOB_STORE_ID = 'store_fixture';
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const oidc = `eyJhbGciOiJIUzI1NiJ9.${payload}.test-only-signature`;
  globalThis[contextSymbol] = { get: () => ({ headers: { 'x-vercel-oidc-token': oidc } }) };
  const login = await auth.fetch(new Request('https://game.test/api/auth', {
    method: 'POST', body: JSON.stringify({ password: 'local-test-password' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const request = () => new Request('https://game.test/api/house-model', { headers: { cookie } });
  const originalDispatcher = getGlobalDispatcher();
  const transport = new MockAgent();
  transport.disableNetConnect();
  setGlobalDispatcher(transport);
  t.after(async () => { setGlobalDispatcher(originalDispatcher); await transport.close(); });
  let upstream = { statusCode: 200, data: '{"fixture":true}' };
  let calls = 0;
  transport.get(new URL(url).origin).intercept({
    path: '/model.json?cache=0', method: 'GET',
    headers: { authorization: `Bearer ${oidc}` },
  }).reply(() => { calls++; return upstream; }).persist();

  await t.test('anonymous and unsupported requests do not contact Blob', async () => {
    assert.equal((await route.fetch(new Request('https://game.test/api/house-model'))).status, 401);
    assert.equal((await route.fetch(new Request('https://game.test/api/house-model', { method: 'POST' }))).status, 405);
    assert.equal(calls, 0);
  });
  await t.test('login cookie loads private bytes without either token env var', async () => {
    assert.equal(process.env.VERCEL_OIDC_TOKEN, undefined);
    assert.equal(process.env.BLOB_READ_WRITE_TOKEN, undefined);
    const response = await route.fetch(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), '{"fixture":true}');
    assert.equal(calls, 1);
  });
  await t.test('missing URL has a distinct configuration error', async () => {
    delete process.env.HOUSE_MODEL_URL;
    const response = await route.fetch(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'MODEL_URL_MISSING');
    process.env.HOUSE_MODEL_URL = url;
  });
  await t.test('non-private URLs cannot receive Blob credentials', async () => {
    process.env.HOUSE_MODEL_URL = 'https://example.com/model.json';
    assert.equal((await (await route.fetch(request())).json()).code, 'MODEL_URL_INVALID');
    process.env.HOUSE_MODEL_URL = url;
  });
  await t.test('absent storage binding has a distinct access error', async () => {
    delete process.env.BLOB_STORE_ID;
    const response = await route.fetch(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'BLOB_AUTH_MISSING');
    process.env.BLOB_STORE_ID = 'store_fixture';
  });
  await t.test('missing file and forbidden Blob access remain visible', async () => {
    upstream = { statusCode: 404, data: '' };
    assert.equal((await route.fetch(request())).status, 404);
    upstream = { statusCode: 403, data: '' };
    const response = await route.fetch(request());
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.match(body, /BLOB_READ_FAILED/);
    assert.ok(!body.includes(oidc));
    assert.ok(!body.includes(url));
  });
  await t.test('oversized streams are rejected without a content-length header', async () => {
    upstream = { statusCode: 200, data: 'x'.repeat(512_001) };
    assert.equal((await route.fetch(request())).status, 413);
  });
});

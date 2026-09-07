import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, isAuthenticated, safeEqual, sessionCookie } from '../src/server/auth.ts';

test('private session cookies are signed, expire and cannot be altered', async () => {
  process.env.GAME_PASSWORD = 'test-only-password';
  delete process.env.GAME_AUTH_SECRET;
  const session = await createSession();
  assert.ok(session);
  const request = { headers: { cookie: sessionCookie(session).split(';')[0] } };
  assert.equal(await isAuthenticated(request), true);
  const altered = `${session.slice(0, -1)}${session.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(await isAuthenticated({ headers: { cookie: sessionCookie(altered).split(';')[0] } }), false);
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  delete process.env.GAME_PASSWORD;
});

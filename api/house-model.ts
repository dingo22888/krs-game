const MAX_MODEL_BYTES = 512_000;
const SESSION_COOKIE = 'krs_game_session';
function encoded(value: string): Uint8Array { return new TextEncoder().encode(value); }
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function signature(payload: string): Promise<string | null> {
  const secret = process.env.GAME_AUTH_SECRET ?? process.env.GAME_PASSWORD ?? null;
  if (!secret) return null;
  const key = await crypto.subtle.importKey('raw', encoded(secret) as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoded(payload) as unknown as BufferSource)));
}
function safeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let i = 0; i < length; i++) difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return difference === 0;
}
async function isAuthenticated(request: Request): Promise<boolean> {
  const header = request.headers.get('cookie') ?? '';
  const pair = header.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  const token = pair ? decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1)) : null;
  if (!token) return false;
  const [expires, supplied] = token.split('.');
  const expiry = Number(expires);
  if (!supplied || !Number.isSafeInteger(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;
  const expected = await signature(expires);
  return expected !== null && safeEqual(expected, supplied);
}

function json(body: unknown, status = 200): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method.toUpperCase() !== 'GET') return json({ error: 'Methode nicht erlaubt.' }, 405);
    if (!await isAuthenticated(request)) return json({ error: 'Anmeldung erforderlich.' }, 401);

    const url = process.env.HOUSE_MODEL_URL;
    const token = process.env.VERCEL_OIDC_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
    if (!url || !token) return json({ error: 'Privates Hausmodell ist in Vercel noch nicht konfiguriert.' }, 503);
    try {
      const blob = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!blob.ok) return json({ error: 'Privates Hausmodell konnte nicht gelesen werden.' }, blob.status === 404 ? 404 : 502);
      const model = await blob.text();
      if (new TextEncoder().encode(model).byteLength > MAX_MODEL_BYTES) return json({ error: 'Das Hausmodell ist zu groß.' }, 413);
      return new Response(model, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'inline',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return json({ error: 'Verbindung zum privaten Hausmodell fehlgeschlagen.' }, 502);
    }
  },
};

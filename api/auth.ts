const SESSION_COOKIE = 'krs_game_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function configuredPassword(): string | null { return process.env.GAME_PASSWORD ?? null; }
function configuredSecret(): string | null { return process.env.GAME_AUTH_SECRET ?? process.env.GAME_PASSWORD ?? null; }
function encoded(value: string): Uint8Array { return new TextEncoder().encode(value); }
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function signature(payload: string): Promise<string | null> {
  const secret = configuredSecret();
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
async function createSession(): Promise<string | null> {
  const payload = String(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE);
  const signed = await signature(payload);
  return signed ? `${payload}.${signed}` : null;
}
function sessionCookie(value: string, maxAge = SESSION_MAX_AGE): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
function cookieValue(request: Request): string | null {
  const header = request.headers.get('cookie') ?? '';
  const pair = header.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  return pair ? decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1)) : null;
}
async function isAuthenticated(request: Request): Promise<boolean> {
  const token = cookieValue(request);
  if (!token) return false;
  const [expires, supplied] = token.split('.');
  const expiry = Number(expires);
  if (!supplied || !Number.isSafeInteger(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;
  const expected = await signature(expires);
  return expected !== null && safeEqual(expected, supplied);
}

function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const method = request.method.toUpperCase();
    const configured = configuredPassword();
    if (!configured) return json({ authenticated: false, error: 'GAME_PASSWORD ist in Vercel noch nicht gesetzt.' }, 503);

    if (method === 'GET') {
      const authenticated = await isAuthenticated(request);
      return json({ authenticated }, authenticated ? 200 : 401);
    }
    if (method === 'DELETE') {
      return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (method !== 'POST') return json({ error: 'Methode nicht erlaubt.' }, 405, { Allow: 'GET, POST, DELETE' });

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // Treat an empty or malformed body as a failed password attempt.
    }
    const supplied = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).password
      : undefined;
    if (typeof supplied !== 'string' || !safeEqual(supplied, configured)) {
      return json({ authenticated: false, error: 'Das Passwort ist nicht korrekt.' }, 401);
    }
    const session = await createSession();
    if (!session) return json({ authenticated: false, error: 'Authentifizierung ist nicht konfiguriert.' }, 503);
    return json({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(session) });
  },
};

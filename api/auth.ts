import {
  configuredPassword,
  createSession,
  isAuthenticated,
  safeEqual,
  sessionCookie,
  type ApiRequest,
} from '../src/server/auth.ts';

function authRequest(request: Request, body?: unknown): ApiRequest {
  return {
    method: request.method,
    headers: { cookie: request.headers.get('cookie') ?? undefined },
    body,
  };
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
      const authenticated = await isAuthenticated(authRequest(request));
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

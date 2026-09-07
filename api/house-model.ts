import { isAuthenticated, type ApiRequest } from '../src/server/auth.ts';

const MAX_MODEL_BYTES = 512_000;

function authRequest(request: Request): ApiRequest {
  return { method: request.method, headers: { cookie: request.headers.get('cookie') ?? undefined } };
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
    if (!await isAuthenticated(authRequest(request))) return json({ error: 'Anmeldung erforderlich.' }, 401);

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

import { createClient } from '@supabase/supabase-js';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function authMode(): 'password' | 'supabase' {
  const mode = process.env.GAME_AUTH_MODE?.trim() || 'password';
  if (mode !== 'password' && mode !== 'supabase') throw new HttpError(503, 'Ungültige Auth-Konfiguration.');
  return mode;
}
export function publicConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();
  if (!url || !publishableKey) throw new HttpError(503, 'Supabase-Zugang ist noch nicht konfiguriert.');
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) throw new HttpError(503, 'Ungültige Supabase-URL.');
  // Never let an accidentally misplaced secret reach the public config endpoint.
  if (!publishableKey.startsWith('sb_publishable_')) {
    try {
      const claims = JSON.parse(atob(publishableKey.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
      if (claims.role !== 'anon') throw new Error();
    } catch { throw new HttpError(503, 'Ein öffentlicher Supabase-Schlüssel wird benötigt.'); }
  }
  return { url, publishableKey };
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) } };
export function adminClient() {
  const { url } = publicConfig();
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new HttpError(503, 'Supabase-Serverzugang ist noch nicht konfiguriert.');
  return createClient(url, key, options);
}
export async function requireMember(request: Request) {
  if (authMode() !== 'supabase') throw new HttpError(503, 'Persönliche Konten und Ranglisten sind noch nicht aktiviert.');
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 8192) throw new HttpError(401, 'Bitte anmelden.');
  const { url, publishableKey } = publicConfig();
  const verifier = createClient(url, publishableKey, options);
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new HttpError(401, 'Deine Sitzung ist abgelaufen. Bitte erneut anmelden.');
  const db = adminClient();
  const membership = await db.from('game_members').select('user_id').eq('user_id', data.user.id).eq('active', true).maybeSingle();
  if (membership.error) throw new HttpError(503, 'Freischaltung konnte nicht geprüft werden.');
  if (!membership.data) throw new HttpError(403, 'Dein Konto ist für KrausMansion noch nicht freigeschaltet.');
  return { userId: data.user.id, db };
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export function errorResponse(error: unknown) {
  return json({ error: error instanceof HttpError ? error.message : 'Der Dienst ist gerade nicht erreichbar. Bitte erneut versuchen.' }, error instanceof HttpError ? error.status : 503);
}
export async function smallBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Anfrage fehlt.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new HttpError(413, 'Anfrage zu groß.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new HttpError(400, 'Ungültige Anfrage.'); }
}

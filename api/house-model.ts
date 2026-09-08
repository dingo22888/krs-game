import { get } from '@vercel/blob';

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

export function classifyBlobError(error:unknown) {
  const message=error instanceof Error?error.message:'';
  const upstreamStatus=Number(message.match(/Failed to fetch blob: (\d{3})\b/)?.[1]) || undefined;
  const cause=error instanceof Error?error.cause:undefined;
  const networkCode=cause && typeof cause==='object' && 'code' in cause?String(cause.code):'';
  if(message.includes('No blob credentials found') || message.includes('no storeId was found'))
    return {code:'BLOB_AUTH_MISSING',status:503,retry:false,upstreamStatus,error:'Vercel-Blob-Zugriff fehlt. Store mit Production verknüpfen und neu deployen.'};
  if(upstreamStatus===401 || upstreamStatus===403)
    return {code:'BLOB_ACCESS_DENIED',status:502,retry:false,upstreamStatus,error:'Der private Blob-Store verweigert den Zugriff. Production-Verknüpfung und OIDC-Berechtigung prüfen. Alternativ einen gültigen BLOB_READ_WRITE_TOKEN für diesen Store in Vercel hinterlegen und neu deployen.'};
  if(upstreamStatus===402)
    return {code:'BLOB_LIMIT_REACHED',status:503,retry:false,upstreamStatus,error:'Vercel Blob meldet ein Nutzungs- oder Abrechnungslimit. Den Status des Stores in Vercel prüfen.'};
  if(upstreamStatus===429)
    return {code:'BLOB_RATE_LIMITED',status:503,retry:true,upstreamStatus,error:'Zu viele Abrufe beim Blob-Store. Bitte kurz warten und erneut laden.'};
  if(error instanceof Error && (error.name==='TimeoutError' || error.name==='AbortError'))
    return {code:'BLOB_TIMEOUT',status:504,retry:true,upstreamStatus,error:'Der Blob-Store antwortet zu langsam. Bitte erneut laden.'};
  if((upstreamStatus && upstreamStatus>=500) || message==='fetch failed' ||
    ['ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(networkCode))
    return {code:'BLOB_UNAVAILABLE',status:502,retry:true,upstreamStatus,error:'Der Blob-Store ist vorübergehend nicht erreichbar. Bitte erneut laden.'};
  return {code:'BLOB_READ_FAILED',status:502,retry:false,upstreamStatus,error:'Das private Hausmodell konnte nicht gelesen werden. Bitte den Fehlercode aus den Vercel-Logs prüfen.'};
}

async function readBlob(url:string) {
  // An explicitly configured store token takes precedence over auto-detected
  // OIDC; the SDK otherwise prefers OIDC even when both env vars are present.
  const token=process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
  for(let attempt=1;;attempt++) {
    try {return await get(url,{access:'private',token,useCache:false,abortSignal:AbortSignal.timeout(5000)});}
    catch(error) {
      const diagnosis=classifyBlobError(error);
      console.warn('[house-model] blob_read_attempt_failed',{
        code:diagnosis.code,upstreamStatus:diagnosis.upstreamStatus,attempt,
        authMode:token?'store-token':'oidc',hasStoreBinding:Boolean(process.env.BLOB_STORE_ID),
      });
      if(!diagnosis.retry || attempt>=3)throw error;
      await new Promise(resolve=>setTimeout(resolve,attempt*250));
    }
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method.toUpperCase() !== 'GET') return json({ error: 'Methode nicht erlaubt.' }, 405);
    if (!await isAuthenticated(request)) return json({ error: 'Anmeldung erforderlich.' }, 401);

    const url = process.env.HOUSE_MODEL_URL?.trim();
    if (!url) {
      console.error('[house-model] missing_model_url');
      return json({ code: 'MODEL_URL_MISSING', error: 'HOUSE_MODEL_URL fehlt im aktiven Deployment. In Vercel für Production setzen und neu deployen.' }, 503);
    }
    try {
      const target = new URL(url);
      if (target.protocol !== 'https:' || !target.hostname.endsWith('.private.blob.vercel-storage.com') || target.username || target.password) throw new Error('Invalid private Blob URL');
    } catch {
      console.error('[house-model] invalid_model_url');
      return json({ code: 'MODEL_URL_INVALID', error: 'HOUSE_MODEL_URL muss die HTTPS-URL der Datei im privaten Vercel-Blob-Store sein.' }, 503);
    }
    try {
      // The SDK obtains rotating OIDC credentials from Vercel's request context.
      // Do not require VERCEL_OIDC_TOKEN to exist in process.env at runtime.
      console.info('[house-model] blob_read_started');
      const blob = await readBlob(url);
      if (!blob || blob.statusCode !== 200) {
        console.warn('[house-model] blob_not_found');
        return json({ code: 'MODEL_NOT_FOUND', error: 'Die Hausdatei wurde im privaten Blob-Store nicht gefunden. HOUSE_MODEL_URL prüfen.' }, 404);
      }
      const reader = blob.stream.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_MODEL_BYTES) {
            await reader.cancel();
            return json({ error: 'Das Hausmodell ist zu groß.' }, 413);
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const data = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      const model = new TextDecoder().decode(data);
      console.info('[house-model] blob_read_succeeded', { bytes });
      return new Response(model, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'inline',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (error) {
      // Never log the SDK message, URL, credential or raw upstream response.
      const diagnosis=classifyBlobError(error);
      console.error('[house-model] blob_read_failed',{code:diagnosis.code,upstreamStatus:diagnosis.upstreamStatus});
      return json({code:diagnosis.code,error:diagnosis.error},diagnosis.status);
    }
  },
};

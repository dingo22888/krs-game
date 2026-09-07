export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string | string[]): ApiResponse;
  json(body: unknown): ApiResponse;
  end(body?: string): void;
}

export const SESSION_COOKIE = 'krs_game_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function configuredSecret(): string | null {
  return process.env.GAME_AUTH_SECRET ?? process.env.GAME_PASSWORD ?? null;
}

export function configuredPassword(): string | null {
  return process.env.GAME_PASSWORD ?? null;
}

async function signature(payload: string): Promise<string | null> {
  const secret = configuredSecret();
  if (!secret) return null;
  const key = await crypto.subtle.importKey('raw', text(secret) as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, text(payload) as unknown as BufferSource);
  return base64url(new Uint8Array(digest));
}

/** Constant-time comparison for the password and cookie signatures. */
export function safeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let i = 0; i < length; i++) difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return difference === 0;
}

function cookieHeader(request: ApiRequest): string {
  const value = request.headers.cookie;
  return Array.isArray(value) ? value.join(';') : value ?? '';
}

function cookieValue(request: ApiRequest): string | null {
  const pair = cookieHeader(request).split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  return pair ? decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1)) : null;
}

export async function createSession(): Promise<string | null> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = String(expires);
  const signed = await signature(payload);
  return signed ? `${payload}.${signed}` : null;
}

export async function isAuthenticated(request: ApiRequest): Promise<boolean> {
  const token = cookieValue(request);
  if (!token) return false;
  const [expires, supplied] = token.split('.');
  const expiry = Number(expires);
  if (!supplied || !Number.isSafeInteger(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;
  const expected = await signature(expires);
  return expected !== null && safeEqual(expected, supplied);
}

export function sessionCookie(value: string, maxAge = SESSION_MAX_AGE): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function noStore(response: ApiResponse): ApiResponse {
  return response.setHeader('Cache-Control', 'no-store').setHeader('X-Content-Type-Options', 'nosniff');
}

export function requestBody(request: ApiRequest): Record<string, unknown> {
  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) return request.body as Record<string, unknown>;
  if (typeof request.body === 'string') {
    try {
      const parsed: unknown = JSON.parse(request.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Capture callback intent before Supabase consumes the URL. */
export function passwordSetupRequested(url: URL): boolean {
  const hash = new URLSearchParams(url.hash.slice(1));
  return url.searchParams.has('set-password') || [hash.get('type'), url.searchParams.get('type')]
    .some(type => type === 'recovery' || type === 'invite');
}

/** The SDK clears hash tokens, but query-string callbacks need cleanup too. */
export function cleanAuthCallbackUrl(url: URL, needsPassword: boolean): string {
  const clean = new URL(url);
  const keys = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
    'token_type', 'expires_in', 'expires_at', 'type', 'code', 'error', 'error_code', 'error_description'];
  for (const key of keys) clean.searchParams.delete(key);
  const hash = new URLSearchParams(clean.hash.slice(1));
  if (keys.some(key => hash.has(key))) clean.hash = '';
  if (needsPassword) clean.searchParams.set('set-password', '1');
  else clean.searchParams.delete('set-password');
  return clean.pathname + clean.search + clean.hash;
}

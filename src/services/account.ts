import type { SupabaseClient } from '@supabase/supabase-js';

class GameAccount {
  mode: 'local' | 'password' | 'supabase' = 'local';
  client?: SupabaseClient;
  displayName = 'Spieler';
  needsPassword = false;
  onLocked = (_message: string) => {};
  private initialized = false;
  async configure() {
    if (this.initialized) return;
    if (import.meta.env.DEV && !import.meta.env.VITE_TEST_AUTH) { this.initialized = true; return; }
    const response = await fetch('/api/auth?config', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Anmeldung konnte nicht vorbereitet werden.');
    this.mode = data.mode;
    if (this.mode === 'supabase') {
      this.needsPassword = /(?:type=)(?:recovery|invite)/.test(location.hash) || new URLSearchParams(location.search).has('set-password');
      const { createClient } = await import('@supabase/supabase-js');
      this.client = createClient(data.url, data.publishableKey);
      this.client.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') { this.needsPassword = true; this.onLocked('Bitte lege dein neues Passwort fest.'); }
        if (event === 'SIGNED_OUT') this.onLocked('Du bist abgemeldet.');
      });
      // Wait for URL session processing before deciding whether to show login.
      await this.client.auth.getSession();
    }
    this.initialized = true;
  }
  async request(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    if (this.client) {
      const { data } = await this.client.auth.getSession();
      if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`);
    }
    const response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      const data = await response.clone().json().catch(() => ({}));
      this.onLocked(data.error || 'Bitte erneut anmelden.');
    }
    return response;
  }
  async check() {
    if (this.mode === 'local') return true;
    if (this.needsPassword) return false;
    const response = await this.request('/api/auth');
    if (!response.ok) return false;
    const data = await response.json(); this.displayName = data.displayName || 'Spieler';
    return true;
  }
  async signIn(email: string, password: string) {
    if (this.client) {
      const { error } = this.needsPassword
        ? await this.client.auth.updateUser({ password })
        : await this.client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(this.needsPassword ? 'Passwort konnte nicht gesetzt werden. Mindestens 12 Zeichen verwenden oder einen neuen Link anfordern.' : 'E-Mail oder Passwort stimmen nicht.');
      this.needsPassword = false;
      history.replaceState(null, '', location.pathname);
    } else {
      const response = await this.request('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Anmeldung fehlgeschlagen.');
    }
  }
  async recover(email: string) {
    if (!this.client || !email) throw new Error('Bitte zuerst deine E-Mail-Adresse eingeben.');
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/?set-password=1` });
    if (error) throw new Error('Die E-Mail konnte nicht versendet werden. Bitte später erneut versuchen.');
  }
  async signOut() {
    try {
      if (this.client) await this.client.auth.signOut({ scope: 'local' });
      else await this.request('/api/auth', { method: 'DELETE' });
    } finally {
      try { localStorage.removeItem('krs-game.local-house.v1'); } catch { /* Optional storage. */ }
      location.reload();
    }
  }
}
export const account = new GameAccount();

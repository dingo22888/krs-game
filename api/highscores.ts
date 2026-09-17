import { requireMember, json, errorResponse, HttpError, smallBody } from '../src/server/supabase.ts';
import { gameId, scoreResult } from '../src/server/score-rules.ts';

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (!['GET', 'POST', 'PATCH'].includes(request.method)) throw new HttpError(405, 'Methode nicht erlaubt.');
      const { userId, db } = await requireMember(request);
      if (request.method === 'GET') {
        const game = gameId(new URL(request.url).searchParams.get('game'));
        const { data, error } = await db.rpc('game_leaderboard', { p_user: userId, p_game: game });
        if (error) throw new HttpError(503, 'Rangliste konnte nicht geladen werden.');
        return json({ game, entries: data });
      }
      const body = await smallBody(request);
      if (request.method === 'PATCH') {
        const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
        if (name.length < 2 || name.length > 24 || /[\p{C}<>]/u.test(name)) throw new HttpError(400, 'Bitte einen Anzeigenamen mit 2–24 Zeichen wählen.');
        const { error } = await db.from('player_profiles').upsert({ user_id: userId, display_name: name });
        if (error) throw new HttpError(503, 'Name konnte nicht gespeichert werden.');
        return json({ displayName: name });
      }
      const game = gameId(body.game);
      if (body.action === 'start') {
        const { data, error } = await db.rpc('start_game_run', { p_user: userId, p_game: game });
        if (error) throw new HttpError(error.message.includes('RATE_LIMIT') ? 429 : 503, error.message.includes('RATE_LIMIT') ? 'Bitte kurz warten, bevor du eine neue Runde startest.' : 'Wertung konnte nicht gestartet werden.');
        return json({ runId: data.id, expiresAt: data.expires_at });
      }
      if (body.action !== 'finish' || typeof body.runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.runId)) throw new HttpError(400, 'Ungültiger Spielabschluss.');
      const run = await db.from('game_runs').select('game').eq('id', body.runId).eq('user_id', userId).maybeSingle();
      if (run.error) throw new HttpError(503, 'Lauf konnte nicht geprüft werden.');
      if (!run.data || run.data.game !== game) throw new HttpError(404, 'Spielrunde nicht gefunden.');
      const result = scoreResult(game, body.result);
      const { data, error } = await db.rpc('finish_game_run', { p_user: userId, p_run: body.runId, p_score: result.score, p_secondary: result.secondary, p_details: result.details });
      if (error) {
        if (/RUN_EXPIRED|RUN_TOO_SHORT/.test(error.message)) throw new HttpError(409, 'Diese Runde ist abgebrochen, abgelaufen oder zu kurz. Starte eine neue Wertung.');
        throw new HttpError(503, 'Ergebnis konnte nicht gespeichert werden. Erneut versuchen.');
      }
      return json({ saved: true, score: data.score, secondary: data.secondary_score });
    } catch (error) { return errorResponse(error); }
  },
};

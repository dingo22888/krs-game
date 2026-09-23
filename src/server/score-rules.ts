import {dartScore} from '../game/darts.ts';
import { HttpError } from './supabase.ts';
export const games = ['pong', 'boxing', 'tic-tac-toe', 'darts'] as const;
export type GameId = typeof games[number];
export function gameId(value: unknown): GameId {
  if (!games.includes(value as GameId)) throw new HttpError(400, 'Unbekanntes Minispiel.');
  return value as GameId;
}
export function scoreResult(game: GameId, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Ergebnis fehlt.');
  const data = value as Record<string, unknown>;
  const number = (key: string, max: number) => {
    const n = data[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > max) throw new HttpError(400, 'Ungültiges Spielergebnis.');
    return n;
  };
  if (game === 'darts') {
    if (!Array.isArray(data.throws) || data.throws.length !== 9) throw new HttpError(400, 'Es müssen neun Pfeile geworfen sein.');
    const throws = data.throws.map((hit:unknown)=>{
      if(!hit||typeof hit!=='object')throw new HttpError(400,'Ungültiger Wurf.');
      const {x,y}=hit as {x:unknown;y:unknown};
      if(typeof x!=='number'||typeof y!=='number'||!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>.3||Math.abs(y)>.3)throw new HttpError(400,'Ungültiger Wurf.');
      return {x,y,points:dartScore(x,y).points};
    });
    return {score:throws.reduce((n,h)=>n+h.points,0),secondary:0,details:{throws}};
  }
  if (game === 'pong') {
    const player = number('player', 5), opponent = number('opponent', 5);
    if ((player === 5) === (opponent === 5)) throw new HttpError(400, 'Die Partie ist nicht abgeschlossen.');
    return { score: player === 5 ? 1 : 0, secondary: player - opponent, details: { player, opponent } };
  }
  if (game === 'boxing') {
    const hits = number('hits', 600), combo = number('combo', 600);
    if (combo > hits || (hits > 0 && combo === 0)) throw new HttpError(400, 'Ungültige Treffer-Serie.');
    return { score: combo, secondary: hits, details: { hits, combo } };
  }
  const wins = number('wins', 10), draws = number('draws', 10), losses = number('losses', 10);
  if (wins + draws + losses !== 10) throw new HttpError(400, 'Es müssen zehn Partien abgeschlossen sein.');
  return { score: wins * 3 + draws, secondary: 0, details: { wins, draws, losses } };
}

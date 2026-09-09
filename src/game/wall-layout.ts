import type { FloorPlan } from '../data/house.ts';
import { decomposePolygon, subtractRects } from './geometry.ts';
import type { Rect } from './geometry.ts';

/** Maximum diameter, not a rounding grid: chains cannot move distant walls. */
export const WALL_JOIN_TOLERANCE = .06;
const EPS = 1e-6;

function anchors(rects: Rect[], axis: 0 | 1): Map<number, number> {
  const weights = new Map<number, number>();
  for (const r of rects) for (const value of [r[axis], r[axis + 2]]) {
    weights.set(value, (weights.get(value) ?? 0) + r[3 - axis] - r[1 - axis]);
  }
  const sorted = [...weights.keys()].sort((a, b) => a - b);
  const result = new Map<number, number>();
  for (let i = 0; i < sorted.length;) {
    const group = [sorted[i++]];
    while (i < sorted.length && sorted[i] - group[0] <= WALL_JOIN_TOLERANCE + EPS) group.push(sorted[i++]);
    // Keep the strongest existing wall face; never accumulate an average drift.
    const target = group.reduce((a, b) => weights.get(a)! >= weights.get(b)! ? a : b);
    for (const value of group) result.set(value, target);
  }
  return result;
}

/** Independent floor origins, stairs, furniture and original JSON are untouched. */
export function wallLayout(plan: FloorPlan) {
  const raw = plan.walls.flatMap(decomposePolygon);
  const maps = [anchors(raw, 0), anchors(raw, 1)];
  const walls = raw.map(r => {
    const snapped = r.map((v, i) => maps[i % 2].get(v) ?? v) as Rect;
    for (const axis of [0, 1]) if (snapped[axis + 2] - snapped[axis] <= EPS) {
      // A thin solid can be deliberate. Never erase it by snapping both faces.
      snapped[axis] = r[axis]; snapped[axis + 2] = r[axis + 2];
    }
    return snapped;
  });
  const snap = (value: number, axis: number, tolerance = WALL_JOIN_TOLERANCE) => {
    let nearest = value, distance = tolerance + EPS;
    for (const candidate of new Set(maps[axis].values())) {
      if (Math.abs(candidate - value) < distance) { nearest = candidate; distance = Math.abs(candidate - value); }
    }
    return nearest;
  };
  const openings = plan.openings.map(opening => {
    const original = opening.rect;
    const along = original[2] - original[0] >= original[3] - original[1] ? 0 : 1;
    const across = 1 - along;
    // Jamb measurements can be less precise than wall faces. Only the void's
    // endpoints may reach 10 cm to meet an existing corner; walls stay at 6 cm.
    const rect = original.map((v, i) => snap(v, i % 2, i % 2 === along ? .10 : WALL_JOIN_TOLERANCE)) as Rect;
    // A measured opening is a void through the host wall, not a separate box
    // allowed to protrude into the room. Match depth to a nearby host strip.
    let best: Rect | undefined, score = Infinity;
    for (const wall of walls) {
      const thickness = wall[across + 2] - wall[across];
      if (thickness < .075 || thickness > .65) continue;
      const depthError = Math.abs(wall[across] - original[across]) + Math.abs(wall[across + 2] - original[across + 2]);
      if (Math.abs(wall[across] - original[across]) > .18 || Math.abs(wall[across + 2] - original[across + 2]) > .18) continue;
      const gap = Math.max(0, wall[along] - rect[along + 2], rect[along] - wall[along + 2]);
      if (gap > WALL_JOIN_TOLERANCE + EPS) continue;
      const candidateScore = depthError + gap;
      if (candidateScore < score) { best = wall; score = candidateScore; }
    }
    if (best) { rect[across] = best[across]; rect[across + 2] = best[across + 2]; }
    // Do not collapse an intentionally small declared opening.
    if (rect[2] - rect[0] < .075 || rect[3] - rect[1] < .075) return {...opening, rect: [...original] as Rect};
    return {...opening, rect};
  });
  // Close short unfinished T junctions, not arbitrary gaps between parallel
  // walls. The receiving wall must cover the full thickness of the wall end.
  // Declared openings are protected even if narrower than the join tolerance.
  const joins:Rect[]=[];
  for(const w of walls) for(const along of [0,1]) {
    const across=1-along, thickness=w[across+2]-w[across];
    if(thickness<.075 || thickness>.65 || w[along+2]-w[along]<.4)continue;
    for(const direction of [-1,1]) {
      const end=w[along+(direction===1?2:0)];
      const candidates=walls.filter(v=>v!==w && v[across]<=w[across]+EPS && v[across+2]>=w[across+2]-EPS && v[across+2]-v[across]>thickness+.08 && v[along+2]-v[along]<=.65)
        .map(v=>({v,gap:direction===1?v[along]-end:end-v[along+2]}))
        .filter(c=>c.gap>EPS&&c.gap<=.15+EPS).sort((a,b)=>a.gap-b.gap);
      const target=candidates[0];if(!target)continue;
      const bridge=[...w] as Rect;
      bridge[along]=direction===1?end:end-target.gap;
      bridge[along+2]=direction===1?end+target.gap:end;
      if(openings.some(o=>o.rect[0]<bridge[2]&&o.rect[2]>bridge[0]&&o.rect[1]<bridge[3]&&o.rect[3]>bridge[1]))continue;
      joins.push(bridge);
    }
  }
  walls.push(...joins);
  const retainedOpenings=openings.filter(opening => {
    if (opening.kind !== 'passage') return true;
    const r = opening.rect, along = r[2] - r[0] >= r[3] - r[1] ? 0 : 1, across = 1 - along;
    const jamb = (end: number, direction: number) => walls.some(w => {
      const overlap = Math.min(w[across + 2], r[across + 2]) - Math.max(w[across], r[across]);
      const probe = end + direction * EPS * 4;
      return overlap > (r[across + 2] - r[across]) * .5 && w[along] <= probe && w[along + 2] >= probe;
    });
    const remaining = subtractRects([r], walls).reduce((sum, p) => sum + (p[2] - p[0]) * (p[3] - p[1]), 0);
    const occupied = 1 - remaining / ((r[2] - r[0]) * (r[3] - r[1]));
    // A passage label placed over a solid wall end has no opposite jamb. Do
    // not carve a new exit or hang a floating lintel over this stale annotation.
    return occupied < .8 || (jamb(r[along], -1) && jamb(r[along + 2], 1));
  });
  // Declared openings take precedence over filled PDF contours, also when the
  // window was drawn on top of a continuous wall in the original plan.
  return {walls: subtractRects(walls, retainedOpenings.map(o => o.rect)), openings:retainedOpenings};
}

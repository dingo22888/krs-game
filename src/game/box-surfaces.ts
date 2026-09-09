import type { BoxSpec } from './model.ts';
import { subtractRects } from './geometry.ts';
import type { Rect } from './geometry.ts';

/** Exterior triangles of the union of opaque, same-material axis-aligned boxes.
 * Removes internal and duplicate coplanar faces without visual offsets or any
 * change to the solid volumes used by physics. */
export function boxSurfacePositions(boxes: readonly BoxSpec[]): Float32Array {
  const EPS = 1e-6;
  const bounds = boxes.map(b => ({min: b.position.map((v, a) => v - b.size[a] / 2), max: b.position.map((v, a) => v + b.size[a] / 2)}));
  const positions: number[] = [];
  for (let i = 0; i < bounds.length; i++) {
    const box = bounds[i];
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const plane = sign > 0 ? box.max[axis] : box.min[axis];
      const face: Rect = [box.min[u], box.min[v], box.max[u], box.max[v]];
      const covered: Rect[] = [];
      for (let j = 0; j < bounds.length; j++) {
        if (i === j) continue;
        const other = bounds[j];
        const outward = sign > 0
          ? other.min[axis] <= plane + EPS && other.max[axis] > plane + EPS
          : other.max[axis] >= plane - EPS && other.min[axis] < plane - EPS;
        const duplicate = j < i && Math.abs((sign > 0 ? other.max[axis] : other.min[axis]) - plane) < EPS;
        if (outward || duplicate) covered.push([other.min[u], other.min[v], other.max[u], other.max[v]]);
      }
      for (const [u0, v0, u1, v1] of subtractRects([face], covered)) {
        const corners = [[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
        for (const index of sign > 0 ? [0,1,2,0,2,3] : [0,2,1,0,3,2]) {
          const p = [0,0,0]; p[axis] = plane; p[u] = corners[index][0]; p[v] = corners[index][1];
          positions.push(...p);
        }
      }
    }
  }
  return new Float32Array(positions);
}

export type Point2 = [number, number];
export type Rect = [number, number, number, number];

export function inPolygon(x: number, z: number, points: readonly Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Exact rectangular decomposition for the orthogonal filled PDF contours.
 * Used for both rendering and solid colliders; no hollow triangle walls.
 */
export function decomposePolygon(points: readonly Point2[]): Rect[] {
  const xs = [...new Set(points.map(p => p[0]))].sort((a,b) => a-b);
  const zs = [...new Set(points.map(p => p[1]))].sort((a,b) => a-b);
  const rectangles: Rect[] = [];
  for (let zi = 0; zi < zs.length-1; zi++) {
    const z0 = zs[zi], z1 = zs[zi+1];
    let start: number | null = null;
    for (let xi = 0; xi < xs.length-1; xi++) {
      const solid = inPolygon((xs[xi]+xs[xi+1])/2, (z0+z1)/2, points);
      if (solid && start === null) start = xs[xi];
      if (start !== null && (!solid || xi === xs.length-2)) {
        const end = solid ? xs[xi+1] : xs[xi];
        const prev = rectangles.find(r => r[0] === start && r[2] === end && r[3] === z0);
        if (prev) prev[3] = z1;
        else rectangles.push([start,z0,end,z1]);
        start = null;
      }
    }
  }
  return rectangles;
}

export function rectanglePoints([x0,z0,x1,z1]: Rect): Point2[] {
  return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
}

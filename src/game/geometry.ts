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

/** Subtract openings from slabs and their visible floor finishes alike. */
export function subtractRects(rectangles:Rect[], holes:readonly Rect[]):Rect[] {
  return holes.reduce((parts,hole)=>parts.flatMap(r=>{
    const x0=Math.max(r[0],hole[0]),z0=Math.max(r[1],hole[1]);
    const x1=Math.min(r[2],hole[2]),z1=Math.min(r[3],hole[3]);
    if(x0>=x1||z0>=z1)return [r];
    return [[r[0],r[1],x0,r[3]],[x1,r[1],r[2],r[3]],
      [x0,r[1],x1,z0],[x0,z1,x1,r[3]]].filter(p=>p[2]-p[0]>.00001&&p[3]-p[1]>.00001) as Rect[];
  }),rectangles);
}

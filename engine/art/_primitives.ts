// Shared primitives for generative-art providers.
//
// An art provider is a pure function:  renderArt(code, W, H, color) → DrawOp[]
// — takes the credential code (used as PRNG seed) plus target dimensions
// and accent color, and returns drawing primitives as SVG path strings.
// Canvas and pdf-lib adapters both consume the same DrawOp[] output,
// keeping new art providers runtime-agnostic.
//
// Conventions: SVG-path coordinates are y-down (standard SVG), origin at
// top-left of the (W, H) box. Adapters handle any axis flip.

export interface DrawOp {
  /** SVG path string (e.g., "M 10 10 L 20 20 Z"). */
  d: string;
  /** Fill color in hex, or undefined for no fill. */
  fill?: string;
  /** Fill opacity (0..1). Defaults to 1. */
  fillOpacity?: number;
  /** Stroke color in hex, or undefined for no stroke. */
  stroke?: string;
  /** Stroke opacity (0..1). Defaults to 1. */
  strokeOpacity?: number;
  /** Stroke width in coordinate units. */
  strokeWidth?: number;
}

export type ArtProvider = {
  id: string;
  renderArt: (code: string, W: number, H: number, color: string) => DrawOp[];
};

/* ══════════════════════════════════════════════════
   Seeded PRNG — mulberry32
   ══════════════════════════════════════════════════ */

export function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ══════════════════════════════════════════════════
   2D value noise + marching squares
   ══════════════════════════════════════════════════ */

export function generateNoiseField(
  rng: () => number,
  cols: number,
  rows: number,
  octaves: number,
): number[][] {
  function makeGrid(c: number, r: number) {
    const g: number[][] = [];
    for (let i = 0; i < r; i++) {
      g[i] = [];
      for (let j = 0; j < c; j++) g[i][j] = rng();
    }
    return g;
  }
  function sample(grid: number[][], x: number, y: number, gc: number, gr: number) {
    const fx = x * (gc - 1), fy = y * (gr - 1);
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const dx = fx - ix, dy = fy - iy;
    const ix1 = Math.min(ix + 1, gc - 1);
    const iy1 = Math.min(iy + 1, gr - 1);
    return grid[iy][ix] * (1 - dx) * (1 - dy)
      + grid[iy][ix1] * dx * (1 - dy)
      + grid[iy1][ix] * (1 - dx) * dy
      + grid[iy1][ix1] * dx * dy;
  }
  const field: number[][] = [];
  for (let y = 0; y < rows; y++) field[y] = new Array(cols).fill(0);
  let amp = 1, totalAmp = 0;
  for (let o = 0; o < octaves; o++) {
    const gc = Math.max(3, Math.floor(cols / Math.pow(2, octaves - 1 - o)));
    const gr = Math.max(3, Math.floor(rows / Math.pow(2, octaves - 1 - o)));
    const grid = makeGrid(gc, gr);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        field[y][x] += sample(grid, x / (cols - 1), y / (rows - 1), gc, gr) * amp;
      }
    }
    totalAmp += amp;
    amp *= 0.5;
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) field[y][x] /= totalAmp;
  }
  return field;
}

export interface Segment {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

export function marchingSquares(
  field: number[][],
  threshold: number,
  cols: number,
  rows: number,
): Segment[] {
  const segs: Segment[] = [];
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const tl = field[y][x], tr = field[y][x + 1];
      const bl = field[y + 1][x], br = field[y + 1][x + 1];
      let idx = 0;
      if (tl >= threshold) idx |= 8;
      if (tr >= threshold) idx |= 4;
      if (br >= threshold) idx |= 2;
      if (bl >= threshold) idx |= 1;
      if (idx === 0 || idx === 15) continue;
      const lerp = (a: number, b: number) => (threshold - a) / (b - a);
      const top = { x: x + lerp(tl, tr), y };
      const right = { x: x + 1, y: y + lerp(tr, br) };
      const bottom = { x: x + lerp(bl, br), y: y + 1 };
      const left = { x, y: y + lerp(tl, bl) };
      const add = (a: { x: number; y: number }, b: { x: number; y: number }) => segs.push({ a, b });
      switch (idx) {
        case 1: add(left, bottom); break;
        case 2: add(bottom, right); break;
        case 3: add(left, right); break;
        case 4: add(top, right); break;
        case 5: add(left, top); add(bottom, right); break;
        case 6: add(top, bottom); break;
        case 7: add(left, top); break;
        case 8: add(top, left); break;
        case 9: add(top, bottom); break;
        case 10: add(top, right); add(left, bottom); break;
        case 11: add(top, right); break;
        case 12: add(left, right); break;
        case 13: add(bottom, right); break;
        case 14: add(left, bottom); break;
      }
    }
  }
  return segs;
}

/* ══════════════════════════════════════════════════
   SVG path builders
   ══════════════════════════════════════════════════ */

const r2 = (n: number) => Math.round(n * 100) / 100;

export function pathLine(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${r2(x1)} ${r2(y1)} L ${r2(x2)} ${r2(y2)}`;
}

export function pathRect(x: number, y: number, w: number, h: number): string {
  return `M ${r2(x)} ${r2(y)} L ${r2(x + w)} ${r2(y)} L ${r2(x + w)} ${r2(y + h)} L ${r2(x)} ${r2(y + h)} Z`;
}

/** Ellipse approximated as two SVG arcs (A commands). */
export function pathEllipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${r2(cx - rx)} ${r2(cy)} a ${r2(rx)} ${r2(ry)} 0 1 0 ${r2(rx * 2)} 0 a ${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-rx * 2)} 0 Z`;
}

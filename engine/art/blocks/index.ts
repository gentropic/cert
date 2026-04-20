// LEGO-style block grid — weighted 1..4-unit bricks tiled in rows, with
// per-brick fill opacity sampled from a noise field. Used by the BM series.

import type { ArtProvider, DrawOp } from "../_primitives.ts";
import {
  generateNoiseField,
  hashCode,
  mulberry32,
  pathRect,
} from "../_primitives.ts";

export const id = "blocks";

export const renderArt: ArtProvider["renderArt"] = (code, W, H, color) => {
  // Reference canvas is 2100×2970; scale params so PDF (595×842) looks the same.
  const refH = 2970;
  const rowH = H * (54 / refH);
  const baseUnit = H * (50 / refH);
  const strokeWidth = Math.max(0.4, W / 2100);

  const rng = mulberry32(hashCode(code));
  const nCols = 30, nRows = 42;
  const field = generateNoiseField(rng, nCols, nRows, 3);
  function sampleNoise(nx: number, ny: number) {
    const fx = Math.min(nx, 1) * (nCols - 1);
    const fy = Math.min(ny, 1) * (nRows - 1);
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const dx = fx - ix, dy = fy - iy;
    const ix1 = Math.min(ix + 1, nCols - 1);
    const iy1 = Math.min(iy + 1, nRows - 1);
    return field[iy][ix] * (1 - dx) * (1 - dy)
      + field[iy][ix1] * dx * (1 - dy)
      + field[iy1][ix] * (1 - dx) * dy
      + field[iy1][ix1] * dx * dy;
  }

  const rows = Math.ceil(H / rowH);
  const unitChoices = [1, 1, 2, 2, 2, 3, 3, 4];
  const ops: DrawOp[] = [];

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    let x = 0;
    while (x < W) {
      const units = unitChoices[Math.floor(rng() * unitChoices.length)];
      let bw = baseUnit * units;
      if (W - x - bw < baseUnit) bw = W - x;
      if (bw <= 0) break;
      const value = sampleNoise((x + bw / 2) / W, (y + rowH / 2) / H);
      ops.push({
        d: pathRect(x, y, bw, rowH),
        fill: color,
        fillOpacity: 0.03 + value * 0.17,
      });
      ops.push({
        d: pathRect(x + 0.5, y + 0.5, bw - 1, rowH - 1),
        stroke: color,
        strokeOpacity: 0.06,
        strokeWidth,
      });
      x += bw;
    }
  }
  return ops;
};

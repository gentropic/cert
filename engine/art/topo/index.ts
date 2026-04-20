// Topographic contour map — seeded value noise + marching squares. Used by
// the Patchbay series.

import type { ArtProvider, DrawOp } from "../_primitives.ts";
import {
  generateNoiseField,
  hashCode,
  marchingSquares,
  mulberry32,
  pathLine,
} from "../_primitives.ts";

export const id = "topo";

export const renderArt: ArtProvider["renderArt"] = (code, W, H, color) => {
  const nCols = 40, nRows = 56, octaves = 3;
  const numContours = 10;
  const lineWidth = Math.max(1, W / 1050); // ~2 at W=2100, ~0.57 at W=595
  const opacityMin = 0.15;
  const opacityRange = 0.20;

  const rng = mulberry32(hashCode(code));
  const field = generateNoiseField(rng, nCols, nRows, octaves);
  const scaleX = W / (nCols - 1);
  const scaleY = H / (nRows - 1);

  const ops: DrawOp[] = [];
  for (let i = 1; i <= numContours; i++) {
    const threshold = i / (numContours + 1);
    const opacity = opacityMin + (i / numContours) * opacityRange;
    const segs = marchingSquares(field, threshold, nCols, nRows);
    for (const s of segs) {
      ops.push({
        d: pathLine(s.a.x * scaleX, s.a.y * scaleY, s.b.x * scaleX, s.b.y * scaleY),
        stroke: color,
        strokeOpacity: opacity,
        strokeWidth: lineWidth,
      });
    }
  }
  return ops;
};

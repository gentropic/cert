// Procedural skulls — 5 gold accent skulls + ~200 small silver skulls,
// placed via collision-avoidance. Each skull has seeded geometric variations
// (cranium stretch, jaw dimensions, eye sockets, teeth count). Used by
// Patchbay 501 (NaNoGEon).

import type { ArtProvider, DrawOp } from "../_primitives.ts";
import { hashCode, mulberry32, pathEllipse } from "../_primitives.ts";

export const id = "skulls";

const SILVER = "#8a8a84";

function buildSkull(
  cx: number,
  cy: number,
  size: number,
  rng: () => number,
  color: string,
  opacity: number,
): DrawOp[] {
  const s = size;
  const craniumStretch = 0.9 + rng() * 0.2;
  const jawWidth = 0.55 + rng() * 0.15;
  const jawDrop = 0.35 + rng() * 0.15;
  const eyeSpread = 0.25 + rng() * 0.10;
  const eyeHeight = 0.05 + rng() * 0.10;
  const eyeSize = 0.12 + rng() * 0.06;
  const noseLen = 0.08 + rng() * 0.06;
  const teethCount = 4 + Math.floor(rng() * 4);
  const strokeWidth = Math.max(2, s * 0.02);

  const ops: DrawOp[] = [];

  ops.push({
    d: pathEllipse(cx, cy - s * 0.05, s * 0.45 * craniumStretch, s * 0.5),
    stroke: color,
    strokeOpacity: opacity,
    strokeWidth,
  });

  const jw = s * jawWidth;
  const jd = s * jawDrop;
  const jawD =
    `M ${cx - jw * 0.5} ${cy + s * 0.15}` +
    ` Q ${cx - jw * 0.5} ${cy + s * 0.15 + jd} ${cx} ${cy + s * 0.15 + jd * 1.1}` +
    ` Q ${cx + jw * 0.5} ${cy + s * 0.15 + jd} ${cx + jw * 0.5} ${cy + s * 0.15}`;
  ops.push({ d: jawD, stroke: color, strokeOpacity: opacity, strokeWidth });

  const ex = s * eyeSpread, ey = cy - s * eyeHeight, er = s * eyeSize;
  ops.push({
    d: pathEllipse(cx - ex, ey, er, er * 0.85),
    stroke: color,
    strokeOpacity: opacity,
    strokeWidth,
  });
  ops.push({
    d: pathEllipse(cx + ex, ey, er, er * 0.85),
    stroke: color,
    strokeOpacity: opacity,
    strokeWidth,
  });

  const ny = cy + s * 0.1, nl = s * noseLen;
  ops.push({
    d: `M ${cx - nl * 0.5} ${ny} L ${cx + nl * 0.5} ${ny} L ${cx} ${ny + nl} Z`,
    stroke: color,
    strokeOpacity: opacity,
    strokeWidth,
  });

  const teethY = cy + s * 0.15 + jd * 0.3;
  const teethH = jd * 0.4;
  const teethSpan = jw * 0.4;
  for (let t = 0; t < teethCount; t++) {
    const tx = cx - teethSpan * 0.5 + (teethSpan / (teethCount - 1)) * t;
    ops.push({
      d: `M ${tx} ${teethY} L ${tx} ${teethY + teethH}`,
      stroke: color,
      strokeOpacity: opacity,
      strokeWidth,
    });
  }

  return ops;
}

export const renderArt: ArtProvider["renderArt"] = (code, W, H, color) => {
  const rng = mulberry32(hashCode(code));
  const ops: DrawOp[] = [];
  const placed: { x: number; y: number; r: number }[] = [];
  const overlaps = (x: number, y: number, r: number) => {
    for (const p of placed) {
      const dx = x - p.x, dy = y - p.y;
      const minDist = r + p.r + 8;
      if (dx * dx + dy * dy < minDist * minDist) return true;
    }
    return false;
  };

  // Reference canvas is 2100×2970; keep skulls visually proportional in PDF.
  const scaleFactor = Math.min(W / 2100, H / 2970);
  const sizeMul = Math.max(0.35, scaleFactor);

  const goldRng = mulberry32(hashCode(code) + 7);
  const goldBands = [0.08, 0.26, 0.44, 0.62, 0.80];
  for (let i = 0; i < 5; i++) {
    const scale = (100 + goldRng() * 50) * sizeMul;
    const r = scale * 0.55;
    let px = 0, py = 0, attempts = 0;
    do {
      px = (0.15 + goldRng() * 0.55) * W;
      py = (goldBands[i] + goldRng() * 0.10) * H;
      attempts++;
    } while (overlaps(px, py, r) && attempts < 30);
    placed.push({ x: px, y: py, r });
    const gSkRng = mulberry32(Math.floor(goldRng() * 0xFFFFFF));
    ops.push(...buildSkull(px, py, scale, gSkRng, color, 0.25));
  }

  for (let i = 0; i < 200; i++) {
    const scale = (35 + rng() * 45) * sizeMul;
    const r = scale * 0.45;
    let px = 0, py = 0, attempts = 0;
    do {
      px = rng() * W;
      py = rng() * H;
      attempts++;
    } while (overlaps(px, py, r) && attempts < 40);
    if (attempts >= 40) continue;
    placed.push({ x: px, y: py, r });
    const skRng = mulberry32(Math.floor(rng() * 0xFFFFFF));
    const alpha = 0.08 + rng() * 0.10;
    ops.push(...buildSkull(px, py, scale, skRng, SILVER, alpha));
  }

  return ops;
};

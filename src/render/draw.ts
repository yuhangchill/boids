// Reference renderer for the preview — NOT the production renderer.
//
// Both layer looks draw from the same simulation state in the SAME canvas
// context (a locked decision — never stream positions between windows), and
// the preview shows ONE look at a time so each can be judged:
//
//   particle look — black dots on a pure white background (#fff, exactly).
//   species look  — the group's semantic gradient with each agent carried by
//                   its species NAME. In v1 the name IS the species-identity
//                   stand-in: everything in this piece is language, so the
//                   rough preview renders creatures as the words that were
//                   embedded. The production layer replaces words with
//                   detailed recognizable imagery.

import type { GroupConfig } from '../config/schema';
import type { Boid } from '../sim/flock';
import { WORLD } from '../sim/flock';

export type Look = 'particle' | 'species';

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dpr: number,
  boids: readonly Boid[],
  group: GroupConfig,
  look: Look,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // letterbox the fixed logical world into the canvas
  const s = Math.min(cssW / WORLD.w, cssH / WORLD.h);
  const ox = (cssW - WORLD.w * s) / 2;
  const oy = (cssH - WORLD.h * s) / 2;

  if (look === 'particle') {
    ctx.fillStyle = '#ffffff'; // pure white ground — precisely, not "off-white"
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#000000';
    const r = Math.max(1.2, 2.1 * s);
    for (const b of boids) {
      ctx.beginPath();
      ctx.arc(ox + b.x * s, oy + b.y * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // species look — gradient ground from config, agents as their names
  const grad = ctx.createLinearGradient(0, oy, 0, oy + WORLD.h * s);
  for (const stop of group.gradient) grad.addColorStop(stop.at, stop.hex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cssW, cssH);

  const px = Math.max(7.5, 9.5 * s);
  ctx.font = `500 ${px}px "ABC Diatype", "Helvetica Neue", Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ink = gradientIsDark(group) ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.88)';
  ctx.fillStyle = ink;

  for (const b of boids) {
    const x = ox + b.x * s;
    const y = oy + b.y * s;
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(x, y);
    // keep names readable: flip when heading left
    const flip = Math.cos(a) < 0;
    ctx.rotate(flip ? a + Math.PI : a);
    ctx.fillText(b.species, 0, 0);
    ctx.restore();
  }
}

function gradientIsDark(group: GroupConfig): boolean {
  let lum = 0;
  for (const s of group.gradient) {
    const r = parseInt(s.hex.slice(1, 3), 16);
    const g = parseInt(s.hex.slice(3, 5), 16);
    const b = parseInt(s.hex.slice(5, 7), 16);
    lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return lum / group.gradient.length < 128;
}

/** CSS string for a group's gradient, for swatches in the review UI. */
export function gradientCss(group: GroupConfig, angle = '180deg'): string {
  const stops = group.gradient
    .map((s) => `${s.hex} ${(s.at * 100).toFixed(1)}%`)
    .join(', ');
  return `linear-gradient(${angle}, ${stops})`;
}

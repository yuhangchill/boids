import type { BandGradient, GradientStop } from "../shared/types.js";
import { cosine } from "../shared/vecmath.js";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbDist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/**
 * Choose a group's gradient from the xkcd table by embedding proximity to the
 * group concept (centroid of member embeddings), then a small farthest-point
 * pass for visual variety. Stop COUNT varies per group with band density, so a
 * sparse band gets a simple 2-stop wash and a dense one gets a rich multi-stop
 * blend. Resolved hex is stored; runtime never re-embeds.
 */
export function buildGradient(
  centroid: number[],
  colorEmbeddings: Map<string, number[]>,
  xkcd: Record<string, string>,
  stops: number,
  candidatePool: number,
  angle: number
): BandGradient {
  // Rank color names by proximity to the group concept.
  const ranked: { name: string; hex: string; sim: number }[] = [];
  for (const [name, vec] of colorEmbeddings) {
    const hex = xkcd[name];
    if (!hex) continue;
    ranked.push({ name, hex, sim: cosine(centroid, vec) });
  }
  ranked.sort((a, b) => b.sim - a.sim);

  const pool = ranked.slice(0, Math.max(candidatePool, stops));
  // Greedy farthest-point selection: start from the closest match, then repeatedly
  // add the pooled color most distinct (in RGB) from those already chosen.
  const chosen: typeof pool = pool.length ? [pool[0]] : [];
  while (chosen.length < stops && chosen.length < pool.length) {
    let best = -1;
    let bestMinDist = -1;
    for (let i = 0; i < pool.length; i++) {
      if (chosen.includes(pool[i])) continue;
      let minDist = Infinity;
      for (const c of chosen) minDist = Math.min(minDist, rgbDist(pool[i].hex, c.hex));
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        best = i;
      }
    }
    if (best === -1) break;
    chosen.push(pool[best]);
  }

  // Order stops by luminance for a smooth light→dark ramp, spread evenly.
  chosen.sort((a, b) => luminance(b.hex) - luminance(a.hex));
  const gradientStops: GradientStop[] = chosen.map((c, i) => ({
    name: c.name,
    hex: c.hex,
    pos: chosen.length === 1 ? 0 : i / (chosen.length - 1),
  }));

  return { angle, stops: gradientStops };
}

/**
 * Map a band's member count to a stop count in [minStops, maxStops]. Denser
 * bands → more color stops (the "sparse to dense" variation the brief calls for).
 */
export function stopsForDensity(
  memberCount: number,
  maxMemberCount: number,
  minStops: number,
  maxStops: number
): number {
  if (maxMemberCount <= 0) return minStops;
  const t = Math.sqrt(memberCount / maxMemberCount); // sqrt softens the extremes
  return Math.max(minStops, Math.min(maxStops, Math.round(minStops + t * (maxStops - minStops))));
}

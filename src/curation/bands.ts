import type { ScoredAnimal } from "../shared/types.js";
import { projectOntoUnit } from "../shared/vecmath.js";

export interface ScoreResult {
  animals: ScoredAnimal[]; // sorted most beloved → most reviled (band assigned later)
  min: number;
  max: number;
}

/** Score every animal by projecting its embedding onto the unit axis. */
export function scoreAnimals(
  names: string[],
  embeddings: Map<string, number[]>,
  unitAxis: number[]
): ScoreResult {
  const scored: ScoredAnimal[] = [];
  for (const name of names) {
    const e = embeddings.get(name);
    if (!e) continue;
    scored.push({ name, score: projectOntoUnit(e, unitAxis), band: -1 });
  }
  scored.sort((a, b) => b.score - a.score); // beloved (high) first
  return {
    animals: scored,
    min: scored.length ? scored[scored.length - 1].score : 0,
    max: scored.length ? scored[0].score : 0,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export interface BandInterval {
  index: number;
  scoreMin: number;
  scoreMax: number;
}

/**
 * Default band intervals: equal-width bins across a robust [pLow, pHigh] score
 * range, most beloved → most reviled. Equal-width (not equal-count) is deliberate
 * so DENSITY varies naturally across bands — that variation is exactly what feeds
 * gradient richness downstream. Positions/widths are stored and human-editable.
 */
export function defaultBandIntervals(
  result: ScoreResult,
  count: number,
  rangePercentiles: [number, number]
): BandInterval[] {
  const asc = result.animals.map((a) => a.score).slice().sort((x, y) => x - y);
  const pLow = percentile(asc, rangePercentiles[0]);
  const pHigh = percentile(asc, rangePercentiles[1]);
  const width = (pHigh - pLow) / count || 1;

  const intervals: BandInterval[] = [];
  // Band 0 = most beloved = highest scores → descending edges.
  for (let i = 0; i < count; i++) {
    const hi = pHigh - i * width;
    const lo = pHigh - (i + 1) * width;
    intervals.push({
      index: i,
      scoreMax: i === 0 ? Math.max(result.max, hi) : hi,
      scoreMin: i === count - 1 ? Math.min(result.min, lo) : lo,
    });
  }
  return intervals;
}

/** Assign each animal to a band by its score (clamped into the end bands). */
export function assignBands(result: ScoreResult, intervals: BandInterval[]): void {
  for (const a of result.animals) {
    let band = intervals.findIndex((iv) => a.score <= iv.scoreMax && a.score > iv.scoreMin);
    if (band === -1) {
      // Above the top edge → most beloved band; below bottom → most reviled band.
      band = a.score > intervals[0].scoreMax ? 0 : intervals.length - 1;
    }
    a.band = band;
  }
}

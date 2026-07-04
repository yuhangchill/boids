// config.json is the LOCK between curation and show (PROJECT_BRIEF §9).
// Everything the show/runtime needs is in this file; runtime never re-embeds
// and needs no API. The three iron laws (separation / alignment / cohesion)
// are deliberately NOT in config: they are fixed, identical for every group,
// and live as constants in src/sim/flock.ts so the lock cannot vary them.

export type RuleId =
  | 'selective-coupling'
  | 'asymmetric-influence'
  | 'phase-sync'
  | 'density-targeting'
  | 'tangential-bias'
  | 'startle-scatter'
  | 'independence'
  | 'intergroup';

export interface ScoredAnimal {
  name: string;
  /** Projection onto the unit beloved→reviled axis (cosine; OpenAI vectors are unit norm). */
  score: number;
}

export interface GradientStop {
  /** 0..1 position along the gradient. */
  at: number;
  /** xkcd color name that was matched (the color WORD is the medium). */
  name: string;
  hex: string;
  /** The band member whose embedding anchored this stop. */
  anchor: string;
}

export interface TraitWord {
  word: string;
  /** Cosine affinity to the group centroid, for display/inspection. */
  affinity: number;
}

export interface RuleSelection {
  id: RuleId;
  /** 0..1, scales the rule's steering contribution. */
  weight: number;
  params: Record<string, number>;
}

export interface GroupSim {
  /** Number of agents in this group's flock. */
  count: number;
  /** World units / second. */
  maxSpeed: number;
  /** PRNG seed — same seed + same params reproduces the trajectory exactly. */
  seed: number;
}

export interface GroupConfig {
  /** 0 = most beloved … 4 = most reviled. */
  index: number;
  /** Typographic label, I…V. */
  label: string;
  /** Members resolved from bandCuts at curation time (kept in sync by the review UI). */
  members: string[];
  gradient: GradientStop[];
  traits: {
    relationship: TraitWord[]; // primary input to rule selection
    motion: TraitWord[]; // secondary, a cross-check
  };
  rules: RuleSelection[];
  sim: GroupSim;
}

export interface BoidsConfig {
  version: 1;
  generatedAt: string;
  /** When true, `npm run curate` refuses to overwrite without --force. */
  locked: boolean;
  embedding: { provider: string; model: string; dim: number };
  /** The two endpoint words. V_axis = E(positive) − E(negative). Swap here, re-run curate. */
  axis: { positive: string; negative: string };
  /** All candidates, sorted beloved-first (descending score). */
  animals: ScoredAnimal[];
  /**
   * Four score cut points (descending) carving the sorted list into five bands.
   * Bands are rough intervals, human-editable — not fixed cut points.
   */
  bandCuts: [number, number, number, number];
  groups: GroupConfig[];
}

export const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** Membership is derived from cuts; band i = scores in (cut[i-1], cut[i]] descending. */
export function bandOfScore(score: number, cuts: readonly number[]): number {
  for (let i = 0; i < cuts.length; i++) if (score > cuts[i]) return i;
  return cuts.length;
}

export function membersFromCuts(
  animals: readonly ScoredAnimal[],
  cuts: readonly number[],
): string[][] {
  const bands: string[][] = Array.from({ length: cuts.length + 1 }, () => []);
  for (const a of animals) bands[bandOfScore(a.score, cuts)].push(a.name);
  return bands;
}

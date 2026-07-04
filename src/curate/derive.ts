// Derivation steps of the curation pipeline: banding, gradients, traits,
// and the vector-space words→rules mapping (v1 of the hard step — an
// LLM-assisted mapping is a later pass; see PROJECT_BRIEF §6a).

import type {
  GradientStop,
  GroupConfig,
  RuleSelection,
  ScoredAnimal,
  TraitWord,
} from '../config/schema';
import { ROMAN } from '../config/schema';
import { dot, mean } from '../embed/provider';
import { RULE_LIBRARY, defaultParams } from '../sim/rules';
import { mulberry32, hash32 } from '../sim/prng';
import type { NamedColor } from '../../data/colors';

export type Emb = ReadonlyMap<string, Float32Array>;

/** Default five bands: rough quintiles by count; cuts are midpoints, editable later. */
export function quintileCuts(sorted: readonly ScoredAnimal[]): [number, number, number, number] {
  const cuts: number[] = [];
  const m = sorted.length;
  for (let i = 1; i < 5; i++) {
    const hi = sorted[Math.floor((m * i) / 5) - 1].score;
    const lo = sorted[Math.floor((m * i) / 5)].score;
    cuts.push((hi + lo) / 2);
  }
  return cuts as [number, number, number, number];
}

/**
 * Gradient: the stop COUNT reflects the band's density (sparse band → few
 * stops, dense band → many), and each stop samples the band itself — the
 * anchor member at that quantile picks the xkcd color name nearest to its own
 * embedding. The gradient is a literal walk across the band's semantic terrain.
 */
export function deriveGradient(
  members: readonly string[],
  maxMembers: number,
  emb: Emb,
  colors: readonly NamedColor[],
  colorEmb: readonly Float32Array[],
): GradientStop[] {
  const density = members.length / Math.max(1, maxMembers);
  const nStops = Math.max(3, Math.min(8, 3 + Math.round(density * 5)));
  const used = new Set<string>();
  const stops: GradientStop[] = [];
  for (let k = 0; k < nStops; k++) {
    const q = nStops === 1 ? 0.5 : k / (nStops - 1);
    const anchor = members[Math.round(q * (members.length - 1))];
    const av = emb.get(anchor)!;
    let best = -1;
    let bestSim = -Infinity;
    for (let c = 0; c < colors.length; c++) {
      if (used.has(colors[c].name)) continue;
      const s = dot(av, colorEmb[c]);
      if (s > bestSim) {
        bestSim = s;
        best = c;
      }
    }
    used.add(colors[best].name);
    stops.push({ at: q, name: colors[best].name, hex: colors[best].hex, anchor });
  }
  return stops;
}

/**
 * Trait words are chosen CONTRASTIVELY: affinity = cos(word, band centroid) −
 * cos(word, centroid of ALL animals). Raw similarity is dominated by the
 * constant "this is an animal" component, which made every band pick the same
 * generic words; the contrast keeps only what distinguishes THIS band.
 */
export function topWords(
  centroid: Float32Array,
  global: Float32Array,
  words: readonly string[],
  emb: Emb,
  k: number,
): TraitWord[] {
  return words
    .map((word) => {
      const v = emb.get(word)!;
      return { word, affinity: dot(centroid, v) - dot(global, v) };
    })
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, k)
    .map((t) => ({ word: t.word, affinity: Math.round(t.affinity * 1000) / 1000 }));
}

/**
 * v1 words→rules mapping, pure vector space: each rule's one-line description
 * is embedded; a rule's raw score is the mean similarity to the group's
 * relationship words (primary, weight 1.0) plus its motion words (secondary,
 * weight 0.4). Top three rules are kept, weights min-max mapped to 0.30–0.85.
 * Everything stays human-adjustable in the review UI.
 */
export function deriveRules(
  relationship: readonly TraitWord[],
  motion: readonly TraitWord[],
  emb: Emb,
  ruleEmb: ReadonlyMap<string, Float32Array>,
  groupSeed: number,
): RuleSelection[] {
  const scores = RULE_LIBRARY.map((def) => {
    const rv = ruleEmb.get(def.id)!;
    const rel = relationship.reduce((s, t) => s + dot(emb.get(t.word)!, rv), 0) / relationship.length;
    const mot = motion.reduce((s, t) => s + dot(emb.get(t.word)!, rv), 0) / motion.length;
    return { def, raw: rel + 0.4 * mot };
  });
  // 'intergroup' needs a second flock on screen; keep it out of auto-selection
  // for the single-group v1 preview (still selectable by hand in the UI).
  const eligible = scores.filter((s) => s.def.id !== 'intergroup');
  eligible.sort((a, b) => b.raw - a.raw);
  const picked = eligible.slice(0, 3);
  const lo = picked[picked.length - 1].raw;
  const hi = picked[0].raw;
  const rng = mulberry32(groupSeed);

  return picked.map(({ def, raw }) => {
    const t = hi === lo ? 1 : (raw - lo) / (hi - lo);
    const params = defaultParams(def);
    // deterministic seeded jitter so groups don't all sit on identical defaults
    for (const p of def.params) {
      const jittered = params[p.key] + (rng() * 2 - 1) * 0.15 * (p.max - p.min);
      const snapped = p.min + Math.round((jittered - p.min) / p.step) * p.step;
      params[p.key] = Math.min(p.max, Math.max(p.min, Math.round(snapped * 1000) / 1000));
    }
    return {
      id: def.id,
      weight: Math.round((0.3 + 0.55 * t) * 100) / 100,
      params,
    };
  });
}

export function deriveGroup(
  index: number,
  members: readonly string[],
  maxMembers: number,
  globalCentroid: Float32Array,
  emb: Emb,
  colors: readonly NamedColor[],
  colorEmb: readonly Float32Array[],
  relationshipWords: readonly string[],
  motionWords: readonly string[],
  ruleEmb: ReadonlyMap<string, Float32Array>,
): GroupConfig {
  const centroid = mean(members.map((m) => emb.get(m)!));
  const relationship = topWords(centroid, globalCentroid, relationshipWords, emb, 5);
  const motion = topWords(centroid, globalCentroid, motionWords, emb, 3);
  const seed = hash32(`boids:${index}:${members.join(',')}`);
  const rng = mulberry32(seed);

  return {
    index,
    label: ROMAN[index],
    members: [...members],
    gradient: deriveGradient(members, maxMembers, emb, colors, colorEmb),
    traits: { relationship, motion },
    rules: deriveRules(relationship, motion, emb, ruleEmb, seed),
    sim: {
      count: Math.max(80, Math.min(220, 60 + members.length * 2)),
      maxSpeed: Math.round(110 + (rng() * 2 - 1) * 25),
      seed,
    },
  };
}

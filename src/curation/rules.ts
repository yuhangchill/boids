import type { SelectedRule } from "../shared/types.js";
import type { RuleDef } from "./data.js";
import { cosine } from "../shared/vecmath.js";
import type { RankedWord } from "./traits.js";

/** Mean of the top-k values (robust-ish aggregate; falls back to full mean). */
function meanTopK(values: number[], k: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => b - a).slice(0, Math.min(k, values.length));
  return sorted.reduce((s, x) => s + x, 0) / sorted.length;
}

/**
 * Word → rule composition (v1, vector-space; no LLM yet).
 *
 * Relationship words are the PRIMARY signal, motion words a SECONDARY cross-check.
 * For each library rule we embed its description (embedText) and measure proximity
 * to the group's selected trait words, then select the top rules above a threshold
 * and weight them by proximity. Params are seeded from the library defaults and
 * left human-adjustable. The rule library stays small and Reynolds-level on
 * purpose — the risk being guarded against is rules collapsing into scripted
 * behavior, so we never synthesize new rules here, only select and weight.
 */
export function selectRules(
  relationship: RankedWord[],
  motion: RankedWord[],
  ruleDefs: RuleDef[],
  ruleEmbeddings: Map<string, number[]>,
  wordEmbeddings: Map<string, number[]>,
  opts: { maxPerGroup: number; minProximity: number; minWeight: number }
): SelectedRule[] {
  const relVecs = relationship.map((r) => wordEmbeddings.get(r.word)).filter(Boolean) as number[][];
  const motVecs = motion.map((m) => wordEmbeddings.get(m.word)).filter(Boolean) as number[][];

  const scored = ruleDefs.map((rule) => {
    const rv = ruleEmbeddings.get(rule.id);
    if (!rv) return { rule, proximity: 0 };
    const relComponent = meanTopK(relVecs.map((v) => cosine(rv, v)), 2);
    const motComponent = meanTopK(motVecs.map((v) => cosine(rv, v)), 2);
    // Relationship words dominate; motion is a lighter cross-check.
    const proximity = 0.7 * relComponent + 0.3 * motComponent;
    return { rule, proximity };
  });

  scored.sort((a, b) => b.proximity - a.proximity);

  const selected = scored
    .filter((s) => s.proximity >= opts.minProximity)
    .slice(0, opts.maxPerGroup);

  if (selected.length === 0) return [];

  // Normalize proximities of the selected set into [minWeight, 1].
  const maxProx = selected[0].proximity || 1;
  const minProx = selected[selected.length - 1].proximity;
  const span = maxProx - minProx || 1;

  return selected.map((s) => {
    const t = (s.proximity - minProx) / span; // 0..1 within the selected set
    const weight = Number((opts.minWeight + t * (1 - opts.minWeight)).toFixed(3));
    return {
      id: s.rule.id,
      name: s.rule.name,
      emergent: s.rule.emergent,
      weight,
      params: { ...s.rule.params },
      proximity: Number(s.proximity.toFixed(4)),
    };
  });
}

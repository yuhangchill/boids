// The additional abstract relational rule library (PROJECT_BRIEF §6a).
//
// This is the conceptual core. The three iron laws are fixed and identical for
// every group; per-group character comes ONLY from composing a few more rules
// at the SAME level of abstraction as Reynolds' originals — local, neighbor-
// relative formulas. Nothing here scripts surface movement; milling, schooling,
// scattering, swarming must EMERGE.
//
// Each rule's `description` is embedded at curation time and matched by
// proximity against the group's relationship words (primary) and motion words
// (secondary) to select and weight rules. Keep the library small and
// Reynolds-level; resist adding specific behavioral hacks.

import type { RuleId } from '../config/schema';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
}

export interface RuleDef {
  id: RuleId;
  name: string;
  /** One sentence, embedded at curation time. Local and neighbor-relative by construction. */
  description: string;
  /** What tends to emerge — documentation only, never an instruction to the sim. */
  emerges: string;
  params: ParamDef[];
}

export const RULE_LIBRARY: readonly RuleDef[] = [
  {
    id: 'selective-coupling',
    name: 'Selective coupling',
    description:
      'align and cohere only with neighbors of the same kind, weakly coupled to others',
    emerges: 'sub-flocks, cliques, segregation',
    params: [
      { key: 'kinds', label: 'kinds', min: 2, max: 5, default: 3, step: 1 },
      { key: 'crossCouple', label: 'cross-kind coupling', min: 0, max: 1, default: 0.15, step: 0.01 },
    ],
  },
  {
    id: 'asymmetric-influence',
    name: 'Asymmetric influence',
    description:
      'some neighbors carry more weight than others, a few individuals lead and most follow',
    emerges: 'hierarchy, leadership, streaming lines',
    params: [
      { key: 'spread', label: 'influence spread', min: 0, max: 1, default: 0.7, step: 0.01 },
    ],
  },
  {
    id: 'phase-sync',
    name: 'Phase synchronization',
    description:
      'an internal rhythm couples toward the rhythm of neighbors until pulses synchronize',
    emerges: 'pulsing waves, firefly-like synchrony',
    params: [
      { key: 'coupling', label: 'phase coupling', min: 0, max: 4, default: 1.2, step: 0.05 },
      { key: 'amp', label: 'pulse depth', min: 0, max: 0.9, default: 0.45, step: 0.01 },
      { key: 'freq', label: 'base frequency', min: 0.1, max: 2, default: 0.5, step: 0.05 },
    ],
  },
  {
    id: 'density-targeting',
    name: 'Density targeting',
    description:
      'seek a preferred local crowding, packing tightly together or spacing far apart',
    emerges: 'tight-knit balls vs dispersed haze',
    params: [
      { key: 'target', label: 'preferred neighbors', min: 0, max: 24, default: 8, step: 1 },
      { key: 'gain', label: 'gain', min: 0, max: 2, default: 0.8, step: 0.05 },
    ],
  },
  {
    id: 'tangential-bias',
    name: 'Tangential bias',
    description:
      'steer sideways, perpendicular to the pull of the group center, circling around it',
    emerges: 'milling, vortices, wheeling',
    params: [
      { key: 'chirality', label: 'chirality', min: -1, max: 1, default: 1, step: 2 },
    ],
  },
  {
    id: 'startle-scatter',
    name: 'Startle / scatter',
    description:
      'a sudden spike in local crowding triggers a brief burst of flight away from everyone',
    emerges: 'erratic scattering, flash expansion',
    params: [
      { key: 'threshold', label: 'crowding jump', min: 1, max: 12, default: 4, step: 1 },
      { key: 'burst', label: 'burst strength', min: 0, max: 6, default: 2.5, step: 0.1 },
      { key: 'decay', label: 'decay (s)', min: 0.1, max: 3, default: 0.8, step: 0.05 },
    ],
  },
  {
    id: 'independence',
    name: 'Independence',
    description:
      'attenuate all attention to neighbors and wander alone on a private course',
    emerges: 'solitary drift, loose association',
    params: [
      { key: 'attenuation', label: 'attenuation', min: 0, max: 1, default: 0.7, step: 0.01 },
      { key: 'wander', label: 'wander', min: 0, max: 2, default: 0.6, step: 0.05 },
    ],
  },
  {
    id: 'intergroup',
    name: 'Inter-group relation',
    description:
      'drawn toward or repelled by the members of another group as a whole',
    emerges: 'pursuit, avoidance between flocks',
    params: [
      { key: 'valence', label: 'attract ↔ repel', min: -1, max: 1, default: -0.5, step: 0.05 },
    ],
  },
];

export const RULE_BY_ID: ReadonlyMap<RuleId, RuleDef> = new Map(
  RULE_LIBRARY.map((r) => [r.id, r]),
);

export function defaultParams(def: RuleDef): Record<string, number> {
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}

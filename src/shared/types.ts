/**
 * config.json schema — the single lock between curation (API-time) and show (offline).
 * The show/runtime reads exactly this and needs no network. Human edits in the review
 * UI are persisted straight back into this shape.
 *
 * Fidelity note: the core three rules (separation/alignment/cohesion) are IRON LAWS —
 * identical logic and identical "grace" for every group. They live in `core` and are
 * NOT stored per group. Per-group distinctiveness comes ONLY from `addedRules`. Base
 * kinematics (count, speed, perception) are also shared, so the sole thing that differs
 * between a beloved flock and a reviled flock is the set of added abstract rules.
 */

export interface Endpoints {
  /** The "beloved" pole. V_axis = E(positiveWord) - E(negativeWord). */
  positiveWord: string;
  /** The "reviled" pole. */
  negativeWord: string;
}

export interface CoreWeights {
  separation: number;
  alignment: number;
  cohesion: number;
}

export interface CoreParams {
  world: { width: number; height: number; wrap: boolean };
  /** Fixed timestep (seconds) for the deterministic integrator. */
  timestep: number;
  boidCount: number;
  maxSpeed: number;
  minSpeed: number;
  maxForce: number;
  perceptionRadius: number;
  separationRadius: number;
  weights: CoreWeights;
}

export interface GradientStop {
  /** xkcd color name (kept for provenance/legibility). */
  name: string;
  /** Resolved hex (runtime never re-embeds). */
  hex: string;
  /** Position along the gradient, 0..1. */
  pos: number;
}

export interface BandGradient {
  angle: number;
  stops: GradientStop[];
}

export interface SelectedRule {
  id: string;
  name: string;
  /** 0..1 blend weight applied to this rule's force. */
  weight: number;
  emergent: string;
  /** Rule-specific numeric params, seeded from the library and human-adjustable. */
  params: Record<string, number>;
  /** The proximity score that selected this rule, for transparency in the UI. */
  proximity: number;
}

export interface BandTraits {
  /** Primary input: group-relationship words nearest this group's concept. */
  relationship: string[];
  /** Secondary cross-check: motion/action words nearest this group's concept. */
  motion: string[];
}

export interface Band {
  /** 0 = most beloved … 4 = most reviled. */
  index: number;
  label: string;
  /** Editable band interval in projection-score space (position + width live here). */
  scoreMin: number;
  scoreMax: number;
  /** Animal names falling in this band, most→least beloved within the band. */
  members: string[];
  gradient: BandGradient;
  traits: BandTraits;
  /** Added abstract rules (beyond the always-on core three). */
  addedRules: SelectedRule[];
}

export interface ScoredAnimal {
  name: string;
  /** Projection of E(animal) onto the unit beloved→reviled axis. */
  score: number;
  /** Band index this animal was assigned to. */
  band: number;
}

export interface ConfigMeta {
  schemaVersion: number;
  generatedAt: string;
  provider: string;
  model: string;
  /** Master PRNG seed; per-group previews derive from this + band index. */
  seed: number;
  /** When true, `npm run curate` refuses to overwrite without --force. */
  locked: boolean;
  animalCount: number;
  notes?: string;
}

export interface BoidsConfig {
  meta: ConfigMeta;
  axis: Endpoints;
  core: CoreParams;
  bands: Band[];
  animals: ScoredAnimal[];
}

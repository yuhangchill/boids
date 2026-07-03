import type { CoreParams, SelectedRule } from "../shared/types.js";
import { Prng, mixSeed } from "./prng.js";
import {
  type Vec2,
  add,
  sub,
  scale,
  normalize,
  setMag,
  limit,
  len,
  perpLeft,
  wrapDelta,
} from "./vec2.js";

/**
 * A single boid. Beyond position/velocity it carries a few per-agent latents that
 * the added rules read locally: `kind` (selective coupling), `rank` (asymmetric
 * influence), `phase`/`freq` (phase synchronization), `startle` (scatter). These
 * are set deterministically from the seed and are the ONLY per-agent state; there
 * is no scripted motion anywhere.
 */
export interface Boid {
  pos: Vec2;
  vel: Vec2;
  kind: number;
  rank: number;
  phase: number;
  freq: number;
  startle: number;
}

interface ParsedRules {
  selective?: { weight: number; kinds: number; selectivity: number };
  asymmetric?: { weight: number; strength: number; leaderFraction: number };
  phaseSync?: { weight: number; coupling: number; frequency: number; frequencySpread: number; speedModulation: number };
  density?: { weight: number; target: number; strength: number };
  tangential?: { weight: number; strength: number; sign: number };
  startle?: { weight: number; densityThreshold: number; impulse: number; decay: number };
  independence?: { weight: number; attenuation: number };
  intergroup?: { weight: number; sign: number; strength: number };
  kinds: number;
}

function parseRules(rules: SelectedRule[]): ParsedRules {
  const out: ParsedRules = { kinds: 1 };
  for (const r of rules) {
    const p = r.params;
    switch (r.id) {
      case "selective_coupling":
        out.selective = { weight: r.weight, kinds: Math.max(2, Math.round(p.kinds ?? 3)), selectivity: p.selectivity ?? 0.85 };
        out.kinds = out.selective.kinds;
        break;
      case "asymmetric_influence":
        out.asymmetric = { weight: r.weight, strength: p.strength ?? 0.6, leaderFraction: p.leaderFraction ?? 0.15 };
        break;
      case "phase_synchronization":
        out.phaseSync = {
          weight: r.weight,
          coupling: p.coupling ?? 0.5,
          frequency: p.frequency ?? 0.08,
          frequencySpread: p.frequencySpread ?? 0.02,
          speedModulation: p.speedModulation ?? 0.3,
        };
        break;
      case "density_targeting":
        out.density = { weight: r.weight, target: p.target ?? 8, strength: p.strength ?? 0.5 };
        break;
      case "tangential_bias":
        out.tangential = { weight: r.weight, strength: p.strength ?? 0.6, sign: Math.sign(p.sign ?? 1) || 1 };
        break;
      case "startle_scatter":
        out.startle = { weight: r.weight, densityThreshold: p.densityThreshold ?? 14, impulse: p.impulse ?? 2.0, decay: p.decay ?? 0.9 };
        break;
      case "independence":
        out.independence = { weight: r.weight, attenuation: p.attenuation ?? 0.6 };
        break;
      case "intergroup_bias":
        out.intergroup = { weight: r.weight, sign: Math.sign(p.sign ?? -1) || -1, strength: p.strength ?? 0.4 };
        break;
    }
  }
  return out;
}

export interface FlockInit {
  core: CoreParams;
  addedRules: SelectedRule[];
  seed: number;
}

export class Flock {
  readonly boids: Boid[] = [];
  readonly core: CoreParams;
  readonly rules: ParsedRules;
  private readonly prng: Prng;
  /** Latent centroid of a notional "other" group, for intergroup_bias in preview. */
  private otherCentroid: Vec2 | null = null;

  constructor(init: FlockInit) {
    this.core = init.core;
    this.rules = parseRules(init.addedRules);
    this.prng = new Prng(mixSeed(init.seed, 0x1234));
    this.initBoids();
    if (this.rules.intergroup) {
      // A fixed notional neighbor-group location so the rule is observable in a
      // single-group preview (in the real show this is another flock's centroid).
      this.otherCentroid = { x: this.core.world.width * 0.5, y: this.core.world.height * 0.5 };
    }
  }

  private initBoids(): void {
    const { world, minSpeed, maxSpeed } = this.core;
    const leaderCut = 1 - (this.rules.asymmetric?.leaderFraction ?? 0);
    const p = new Prng(mixSeed(this.core.boidCount, this.prng.int(1 << 30)));
    for (let i = 0; i < this.core.boidCount; i++) {
      const angle = p.range(0, Math.PI * 2);
      const speed = p.range(minSpeed, maxSpeed);
      const rank = p.next();
      this.boids.push({
        pos: { x: p.range(0, world.width), y: p.range(0, world.height) },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        kind: this.rules.kinds > 1 ? p.int(this.rules.kinds) : 0,
        rank: this.rules.asymmetric ? (rank > leaderCut ? 1 : rank) : rank,
        phase: p.range(0, Math.PI * 2),
        freq: (this.rules.phaseSync?.frequency ?? 0.08) + p.range(-1, 1) * (this.rules.phaseSync?.frequencySpread ?? 0),
        startle: 0,
      });
    }
  }

  /** Advance one fixed step. Deterministic given the seed. */
  step(): void {
    const c = this.core;
    const { width: W, height: H } = c.world;
    const perc2 = c.perceptionRadius * c.perceptionRadius;
    const sep2 = c.separationRadius * c.separationRadius;
    const R = this.rules;

    const nextPhase = new Array(this.boids.length);

    for (let i = 0; i < this.boids.length; i++) {
      const b = this.boids[i];

      // Accumulators.
      let sepX = 0, sepY = 0;
      let alignX = 0, alignY = 0, alignW = 0;
      let cohX = 0, cohY = 0, cohW = 0;
      let count = 0;
      let phaseSin = 0;

      for (let j = 0; j < this.boids.length; j++) {
        if (i === j) continue;
        const o = this.boids[j];
        const d = c.world.wrap ? wrapDelta(b.pos, o.pos, W, H) : sub(o.pos, b.pos);
        const dist2 = d.x * d.x + d.y * d.y;
        if (dist2 > perc2 || dist2 < 1e-9) continue;
        count++;

        // Separation from ALL close neighbors (physical avoidance, never gated).
        if (dist2 < sep2) {
          const dist = Math.sqrt(dist2);
          sepX -= d.x / dist / dist;
          sepY -= d.y / dist / dist;
        }

        // Social coupling weight for alignment/cohesion, modulated by rules.
        let w = 1;
        if (R.selective) {
          const same = o.kind === b.kind;
          if (!same) w *= 1 - R.selective.selectivity * R.selective.weight;
        }
        if (R.asymmetric) {
          w *= 1 + R.asymmetric.strength * R.asymmetric.weight * o.rank;
        }

        alignX += o.vel.x * w;
        alignY += o.vel.y * w;
        alignW += w;
        cohX += d.x * w;
        cohY += d.y * w;
        cohW += w;

        if (R.phaseSync) phaseSin += Math.sin(o.phase - b.phase);
      }

      // Core steering (Reynolds). Independence attenuates align+cohesion coupling.
      const coupling = R.independence ? 1 - R.independence.attenuation * R.independence.weight : 1;

      let ax = 0, ay = 0;

      if (sepX !== 0 || sepY !== 0) {
        const s = this.steer({ x: sepX, y: sepY }, b.vel);
        ax += s.x * c.weights.separation;
        ay += s.y * c.weights.separation;
      }
      if (alignW > 0) {
        const s = this.steer({ x: alignX / alignW, y: alignY / alignW }, b.vel);
        ax += s.x * c.weights.alignment * coupling;
        ay += s.y * c.weights.alignment * coupling;
      }
      const cohDelta: Vec2 = cohW > 0 ? { x: cohX / cohW, y: cohY / cohW } : { x: 0, y: 0 };
      if (cohW > 0) {
        const s = this.steer(cohDelta, b.vel);
        ax += s.x * c.weights.cohesion * coupling;
        ay += s.y * c.weights.cohesion * coupling;
      }

      // --- added rules as extra local forces ---

      // Density targeting: cohere below the preferred neighbor count, disperse above.
      if (R.density && (cohW > 0 || count > 0)) {
        let f = (R.density.strength * R.density.weight * (R.density.target - count)) / Math.max(R.density.target, 1);
        f = Math.max(-1, Math.min(1, f));
        const s = this.steer(cohDelta, b.vel);
        ax += s.x * f;
        ay += s.y * f;
      }

      // Tangential bias: steer perpendicular to cohesion → milling.
      if (R.tangential && cohW > 0) {
        const t = perpLeft(cohDelta);
        const s = this.steer({ x: t.x * R.tangential.sign, y: t.y * R.tangential.sign }, b.vel);
        ax += s.x * R.tangential.strength * R.tangential.weight;
        ay += s.y * R.tangential.strength * R.tangential.weight;
      }

      // Startle/scatter: local density spike triggers a decaying outward burst.
      if (R.startle) {
        if (count > R.startle.densityThreshold && b.startle < 0.05) b.startle = R.startle.impulse * R.startle.weight;
        if (b.startle > 0.001 && cohW > 0) {
          const outward = scale(normalize(cohDelta), -1);
          const s = this.steer(outward, b.vel);
          ax += s.x * b.startle;
          ay += s.y * b.startle;
        }
      }

      // Inter-group bias: latent attraction/repulsion to a notional other group.
      if (R.intergroup && this.otherCentroid) {
        const d = c.world.wrap ? wrapDelta(b.pos, this.otherCentroid, W, H) : sub(this.otherCentroid, b.pos);
        const s = this.steer({ x: d.x * R.intergroup.sign, y: d.y * R.intergroup.sign }, b.vel);
        ax += s.x * R.intergroup.strength * R.intergroup.weight;
        ay += s.y * R.intergroup.strength * R.intergroup.weight;
      }

      // Integrate velocity (per fixed step).
      let vx = b.vel.x + ax;
      let vy = b.vel.y + ay;

      // Speed envelope, modulated by phase (visible pulsing) and startle burst.
      let speedScale = 1;
      if (R.phaseSync) speedScale += R.phaseSync.speedModulation * R.phaseSync.weight * Math.sin(b.phase);
      if (b.startle > 0.001) speedScale += b.startle * 0.5;

      const sp = len({ x: vx, y: vy });
      const maxS = c.maxSpeed * speedScale;
      const minS = c.minSpeed;
      if (sp > maxS && sp > 1e-9) {
        vx = (vx / sp) * maxS;
        vy = (vy / sp) * maxS;
      } else if (sp < minS && sp > 1e-9) {
        vx = (vx / sp) * minS;
        vy = (vy / sp) * minS;
      }
      b.vel = { x: vx, y: vy };

      // Phase integration (Kuramoto): natural frequency + coupling toward neighbors.
      if (R.phaseSync) {
        const k = count > 0 ? (R.phaseSync.coupling * R.phaseSync.weight * phaseSin) / count : 0;
        nextPhase[i] = b.phase + b.freq + k;
      } else {
        nextPhase[i] = b.phase;
      }

      // Startle decay.
      if (b.startle > 0.001) b.startle *= R.startle ? R.startle.decay : 0;
    }

    // Second pass: commit positions and phases (positions use freshly-updated vel).
    for (let i = 0; i < this.boids.length; i++) {
      const b = this.boids[i];
      b.pos = add(b.pos, b.vel);
      b.phase = nextPhase[i];
      if (c.world.wrap) {
        b.pos.x = ((b.pos.x % W) + W) % W;
        b.pos.y = ((b.pos.y % H) + H) % H;
      } else {
        if (b.pos.x < 0 || b.pos.x > W) b.vel.x *= -1;
        if (b.pos.y < 0 || b.pos.y > H) b.vel.y *= -1;
        b.pos.x = Math.max(0, Math.min(W, b.pos.x));
        b.pos.y = Math.max(0, Math.min(H, b.pos.y));
      }
    }
  }

  private steer(desiredDir: Vec2, vel: Vec2): Vec2 {
    const desired = setMag(desiredDir, this.core.maxSpeed);
    return limit(sub(desired, vel), this.core.maxForce);
  }
}

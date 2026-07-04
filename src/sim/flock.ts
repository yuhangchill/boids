// The deterministic 2D flocking simulation.
//
// IRON LAWS (PROJECT_BRIEF §6a): separation, alignment, cohesion — fixed
// constants below, identical for every group, always on, never in config.
// Per-group character enters ONLY through the abstract relational rules of
// src/sim/rules.ts, weighted by config. Movement is never scripted here:
// every force is local and neighbor-relative; milling, scattering, pulsing,
// sub-flocking all emerge.
//
// Determinism: fixed timestep + mulberry32 seeded per group. Same config,
// same seed → same trajectory. The world is a fixed logical rectangle; the
// renderer scales it to fit, so trajectories do not depend on canvas size.

import type { GroupConfig, RuleId } from '../config/schema';
import { mulberry32, type Rng } from './prng';

export const WORLD = { w: 1200, h: 750 } as const;
export const DT = 1 / 60;

// Iron-law constants — identical for every group. Not configurable.
const R_SEP = 26;
const R_PERCEPT = 54;
const W_SEP = 1.6;
const W_ALI = 1.0;
const W_COH = 0.9;
const MAX_FORCE = 260; // world units / s²
const MARGIN = 70; // soft containment band at the window edge
const W_WALL = 1.8;

export interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  group: number; // index into the flock's group list
  kind: number; // selective-coupling subset
  influence: number; // asymmetric-influence weight of THIS boid on others
  phase: number; // phase-sync internal oscillator
  wanderAngle: number;
  startle: number; // remaining startle time (s)
  prevN: number; // neighbor count last step (startle detection)
  species: string; // member name, for the species look
}

interface GroupRuntime {
  cfg: GroupConfig;
  rng: Rng;
  weights: Partial<Record<RuleId, number>>;
  params: Partial<Record<RuleId, Record<string, number>>>;
}

export class Flock {
  boids: Boid[] = [];
  time = 0;
  private groups: GroupRuntime[] = [];
  // spatial hash
  private cell = R_PERCEPT;
  private cols = Math.ceil(WORLD.w / this.cell);
  private rows = Math.ceil(WORLD.h / this.cell);
  private grid: number[][] = [];

  constructor(groups: readonly GroupConfig[]) {
    for (const cfg of groups) this.addGroup(cfg);
  }

  private addGroup(cfg: GroupConfig): void {
    const gi = this.groups.length;
    const rng = mulberry32(cfg.sim.seed >>> 0);
    const weights: GroupRuntime['weights'] = {};
    const params: GroupRuntime['params'] = {};
    for (const r of cfg.rules) {
      weights[r.id] = r.weight;
      params[r.id] = r.params;
    }
    this.groups.push({ cfg, rng, weights, params });

    const kinds = Math.max(1, Math.round(params['selective-coupling']?.kinds ?? 1));
    const spread = params['asymmetric-influence']?.spread ?? 0;
    const members = cfg.members.length > 0 ? cfg.members : ['—'];
    for (let i = 0; i < cfg.sim.count; i++) {
      const a = rng() * Math.PI * 2;
      const speed = cfg.sim.maxSpeed * (0.4 + 0.4 * rng());
      // influence: mostly ~1, a few strong leaders when spread is high
      const lead = Math.pow(rng(), 1 + 6 * spread);
      this.boids.push({
        x: WORLD.w * (0.2 + 0.6 * rng()),
        y: WORLD.h * (0.2 + 0.6 * rng()),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        group: gi,
        kind: i % kinds,
        influence: 0.35 + 1.65 * lead,
        phase: rng() * Math.PI * 2,
        wanderAngle: rng() * Math.PI * 2,
        startle: 0,
        prevN: 0,
        species: members[Math.floor(rng() * members.length)],
      });
    }
  }

  reset(): void {
    const cfgs = this.groups.map((g) => g.cfg);
    this.boids = [];
    this.groups = [];
    this.time = 0;
    for (const c of cfgs) this.addGroup(c);
  }

  /**
   * Live-update a group's rules/params without resetting positions, so the
   * effect of an edit can be judged in motion. Count or seed changes rebuild
   * the flock (restart re-establishes strict reproducibility).
   */
  updateGroup(gi: number, cfg: GroupConfig): void {
    const G = this.groups[gi];
    const needReset = cfg.sim.count !== G.cfg.sim.count || cfg.sim.seed !== G.cfg.sim.seed;
    G.cfg = cfg;
    G.weights = {};
    G.params = {};
    for (const r of cfg.rules) {
      G.weights[r.id] = r.weight;
      G.params[r.id] = r.params;
    }
    const kinds = Math.max(1, Math.round(G.params['selective-coupling']?.kinds ?? 1));
    let k = 0;
    for (const b of this.boids) if (b.group === gi) b.kind = k++ % kinds;
    if (needReset) this.reset();
  }

  private buildGrid(): void {
    const n = this.cols * this.rows;
    if (this.grid.length !== n) this.grid = Array.from({ length: n }, () => []);
    else for (const c of this.grid) c.length = 0;
    for (let i = 0; i < this.boids.length; i++) {
      const b = this.boids[i];
      const cx = Math.min(this.cols - 1, Math.max(0, (b.x / this.cell) | 0));
      const cy = Math.min(this.rows - 1, Math.max(0, (b.y / this.cell) | 0));
      this.grid[cy * this.cols + cx].push(i);
    }
  }

  /** Advance exactly one fixed timestep. */
  step(): void {
    this.buildGrid();
    const N = this.boids.length;
    const ax = new Float32Array(N);
    const ay = new Float32Array(N);
    const phaseDelta = new Float32Array(N);
    const localN = new Int32Array(N);

    for (let i = 0; i < N; i++) {
      const b = this.boids[i];
      const G = this.groups[b.group];
      const w = G.weights;
      const p = G.params;
      const maxSpeed = G.cfg.sim.maxSpeed;

      // --- gather neighbors (same group) and other-group centroid ---
      let sepX = 0, sepY = 0;
      let aliX = 0, aliY = 0, aliW = 0;
      let cohX = 0, cohY = 0, cohW = 0;
      let phaseSum = 0;
      let n = 0;
      let otherX = 0, otherY = 0, otherN = 0;

      const crossW = w['selective-coupling'] ?? 0;
      const crossCouple = 1 - crossW * (1 - (p['selective-coupling']?.crossCouple ?? 1));
      const cx0 = Math.max(0, ((b.x - R_PERCEPT) / this.cell) | 0);
      const cx1 = Math.min(this.cols - 1, ((b.x + R_PERCEPT) / this.cell) | 0);
      const cy0 = Math.max(0, ((b.y - R_PERCEPT) / this.cell) | 0);
      const cy1 = Math.min(this.rows - 1, ((b.y + R_PERCEPT) / this.cell) | 0);

      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          for (const j of this.grid[cy * this.cols + cx]) {
            if (j === i) continue;
            const o = this.boids[j];
            const dx = o.x - b.x;
            const dy = o.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > R_PERCEPT * R_PERCEPT) continue;

            if (o.group !== b.group) {
              otherX += o.x; otherY += o.y; otherN++;
              continue;
            }
            const d = Math.sqrt(d2) || 1e-4;
            n++;
            // separation: bodily, never attenuated by coupling choices
            if (d < R_SEP) {
              const f = (R_SEP - d) / R_SEP / d;
              sepX -= dx * f;
              sepY -= dy * f;
            }
            // coupling factor: selective kinds × asymmetric influence
            const c = (o.kind === b.kind ? 1 : crossCouple) * o.influence;
            aliX += o.vx * c; aliY += o.vy * c; aliW += c;
            cohX += o.x * c; cohY += o.y * c; cohW += c;
            phaseSum += Math.sin(o.phase - b.phase);
          }
        }
      }

      // --- iron laws as steering (desired − velocity, clamped) ---
      let fx = 0, fy = 0;
      const steer = (dx: number, dy: number, gain: number) => {
        const m = Math.hypot(dx, dy);
        if (m < 1e-6) return;
        const sx = (dx / m) * maxSpeed - b.vx;
        const sy = (dy / m) * maxSpeed - b.vy;
        const sm = Math.hypot(sx, sy) || 1;
        const cap = Math.min(sm, MAX_FORCE);
        fx += (sx / sm) * cap * gain;
        fy += (sy / sm) * cap * gain;
      };

      // independence attenuates attention to neighbors (not bodily separation)
      const ind = (w['independence'] ?? 0) * (p['independence']?.attenuation ?? 0);
      const att = 1 - ind;

      if (sepX !== 0 || sepY !== 0) steer(sepX, sepY, W_SEP);
      if (aliW > 0) steer(aliX / aliW, aliY / aliW, W_ALI * att);
      let cohDX = 0, cohDY = 0;
      if (cohW > 0) {
        cohDX = cohX / cohW - b.x;
        cohDY = cohY / cohW - b.y;
        steer(cohDX, cohDY, W_COH * att);
      }

      // --- abstract relational rules (weights/params from config) ---

      // tangential bias: steer perpendicular to the cohesion pull → milling
      const wTan = w['tangential-bias'] ?? 0;
      if (wTan > 0 && (cohDX !== 0 || cohDY !== 0)) {
        const ch = p['tangential-bias']?.chirality ?? 1;
        steer(-cohDY * ch, cohDX * ch, wTan);
      }

      // density targeting: signed pressure toward preferred local crowding
      const wDen = w['density-targeting'] ?? 0;
      if (wDen > 0 && (cohDX !== 0 || cohDY !== 0)) {
        const target = p['density-targeting']?.target ?? 8;
        const gain = p['density-targeting']?.gain ?? 1;
        const err = (n - target) / Math.max(4, target); // + = too crowded
        steer(-cohDX * err, -cohDY * err, wDen * gain * Math.min(2, Math.abs(err)));
      }

      // startle / scatter: crowding jump triggers transient flight
      const wSt = w['startle-scatter'] ?? 0;
      if (wSt > 0) {
        const jump = p['startle-scatter']?.threshold ?? 4;
        const decay = p['startle-scatter']?.decay ?? 0.8;
        if (n - b.prevN >= jump) b.startle = decay;
        if (b.startle > 0) {
          const burst = p['startle-scatter']?.burst ?? 2.5;
          const k = b.startle / decay;
          if (sepX !== 0 || sepY !== 0) steer(sepX, sepY, wSt * burst * k);
          const ja = G.rng() * Math.PI * 2;
          fx += Math.cos(ja) * MAX_FORCE * 0.5 * wSt * k;
          fy += Math.sin(ja) * MAX_FORCE * 0.5 * wSt * k;
          b.startle -= DT;
        }
      }
      b.prevN = n;

      // independence: private wandering course
      const wInd = w['independence'] ?? 0;
      if (wInd > 0) {
        const wander = p['independence']?.wander ?? 0.6;
        b.wanderAngle += (G.rng() * 2 - 1) * 4 * DT;
        steer(Math.cos(b.wanderAngle), Math.sin(b.wanderAngle), wInd * wander);
      }

      // inter-group attraction / repulsion (dormant when one group previews)
      const wIg = w['intergroup'] ?? 0;
      if (wIg > 0 && otherN > 0) {
        const val = p['intergroup']?.valence ?? -0.5;
        steer((otherX / otherN - b.x) * val, (otherY / otherN - b.y) * val, wIg * Math.abs(val) * 1.5);
      }

      // phase synchronization (Kuramoto): rhythm couples toward neighbors
      const wPh = w['phase-sync'] ?? 0;
      if (wPh > 0) {
        const freq = p['phase-sync']?.freq ?? 0.5;
        const K = p['phase-sync']?.coupling ?? 1.2;
        phaseDelta[i] =
          2 * Math.PI * freq * DT + (n > 0 ? (K * wPh * phaseSum) / n : 0) * DT * 60;
      }

      // soft containment at the window edge (the physical frame exists)
      if (b.x < MARGIN) steer(maxSpeed, 0, W_WALL * ((MARGIN - b.x) / MARGIN));
      if (b.x > WORLD.w - MARGIN) steer(-maxSpeed, 0, W_WALL * ((b.x - (WORLD.w - MARGIN)) / MARGIN));
      if (b.y < MARGIN) steer(0, maxSpeed, W_WALL * ((MARGIN - b.y) / MARGIN));
      if (b.y > WORLD.h - MARGIN) steer(0, -maxSpeed, W_WALL * ((b.y - (WORLD.h - MARGIN)) / MARGIN));

      ax[i] = fx;
      ay[i] = fy;
      localN[i] = n;
    }

    // --- integrate ---
    for (let i = 0; i < N; i++) {
      const b = this.boids[i];
      const G = this.groups[b.group];
      const w = G.weights;
      const p = G.params;
      b.vx += ax[i] * DT;
      b.vy += ay[i] * DT;
      b.phase = (b.phase + phaseDelta[i]) % (Math.PI * 2);

      // speed limit, pulsed by phase when phase-sync is active
      const amp = (w['phase-sync'] ?? 0) * (p['phase-sync']?.amp ?? 0);
      const cap = G.cfg.sim.maxSpeed * (1 + amp * Math.sin(b.phase));
      const sp = Math.hypot(b.vx, b.vy);
      const minSp = G.cfg.sim.maxSpeed * 0.25;
      if (sp > cap) {
        b.vx = (b.vx / sp) * cap;
        b.vy = (b.vy / sp) * cap;
      } else if (sp < minSp && sp > 1e-6) {
        b.vx = (b.vx / sp) * minSp;
        b.vy = (b.vy / sp) * minSp;
      }
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      // hard clamp as last resort; containment steering does the real work
      b.x = Math.min(WORLD.w - 2, Math.max(2, b.x));
      b.y = Math.min(WORLD.h - 2, Math.max(2, b.y));
    }
    this.time += DT;
  }
}

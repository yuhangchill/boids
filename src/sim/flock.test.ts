import { test } from "node:test";
import assert from "node:assert/strict";
import { Flock } from "./flock.js";
import type { CoreParams, SelectedRule } from "../shared/types.js";

const core: CoreParams = {
  world: { width: 1000, height: 1000, wrap: true },
  timestep: 1,
  boidCount: 120,
  maxSpeed: 3.2,
  minSpeed: 1.1,
  maxForce: 0.09,
  perceptionRadius: 62,
  separationRadius: 22,
  weights: { separation: 1.7, alignment: 1.0, cohesion: 0.9 },
};

const rules: SelectedRule[] = [
  { id: "tangential_bias", name: "Tangential bias", emergent: "milling", weight: 0.8, params: { strength: 0.6, sign: 1 }, proximity: 0.3 },
  { id: "phase_synchronization", name: "Phase sync", emergent: "pulsing", weight: 0.5, params: { coupling: 0.5, frequency: 0.08, frequencySpread: 0.02, speedModulation: 0.3 }, proximity: 0.3 },
];

function run(seed: number, steps: number): number[] {
  const f = new Flock({ core, addedRules: rules, seed });
  for (let i = 0; i < steps; i++) f.step();
  return f.boids.flatMap((b) => [b.pos.x, b.pos.y, b.vel.x, b.vel.y]);
}

test("same seed → identical trajectory (deterministic)", () => {
  const a = run(12345, 400);
  const b = run(12345, 400);
  assert.deepEqual(a, b);
});

test("different seed → different trajectory", () => {
  const a = run(12345, 200);
  const b = run(999, 200);
  assert.notDeepEqual(a, b);
});

test("positions stay finite and inside the wrapped world", () => {
  const f = new Flock({ core, addedRules: rules, seed: 7 });
  for (let i = 0; i < 600; i++) f.step();
  for (const b of f.boids) {
    assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y), "pos finite");
    assert.ok(b.pos.x >= 0 && b.pos.x <= core.world.width, "x in world");
    assert.ok(b.pos.y >= 0 && b.pos.y <= core.world.height, "y in world");
    const sp = Math.hypot(b.vel.x, b.vel.y);
    assert.ok(sp <= core.maxSpeed * 2 + 1e-6, "speed bounded");
  }
});

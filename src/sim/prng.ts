/**
 * Deterministic PRNG (mulberry32). Same seed → same stream, on any platform.
 * Determinism is a locked requirement: previews and the show must be reproducible.
 */
export class Prng {
  private state: number;

  constructor(seed: number) {
    // Force to uint32 so behavior is identical regardless of input magnitude.
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}

/** Mix two integers into a well-distributed uint32 seed (for per-band seeds). */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

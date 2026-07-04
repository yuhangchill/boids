// Swappable embedding provider (PROJECT_BRIEF §6): API only, curation-time
// only. The show/runtime reads config.json and never touches this code.

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dim: number;
  /** Returns one unit-length Float32Array per input, in order. */
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function normalize(v: Float32Array): Float32Array {
  const n = Math.sqrt(dot(v, v));
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export function sub(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i];
  return out;
}

export function mean(vs: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(vs[0].length);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= vs.length;
  return out;
}

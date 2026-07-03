/** Plain vector math on embedding vectors (number[]). Curation-time only. */

export function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

export function unit(a: number[]): number[] {
  const l = norm(a);
  if (l < 1e-12) return a.slice();
  return a.map((x) => x / l);
}

export function subVec(a: number[], b: number[]): number[] {
  const n = Math.max(a.length, b.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  return out;
}

export function meanVec(vs: number[][]): number[] {
  if (vs.length === 0) return [];
  const n = vs[0].length;
  const out = new Array(n).fill(0);
  for (const v of vs) for (let i = 0; i < n; i++) out[i] += v[i];
  for (let i = 0; i < n; i++) out[i] /= vs.length;
  return out;
}

export function cosine(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot(a, b) / (na * nb);
}

/** Projection of vector `x` onto a unit axis: signed scalar (dot product). */
export function projectOntoUnit(x: number[], unitAxis: number[]): number {
  return dot(x, unitAxis);
}

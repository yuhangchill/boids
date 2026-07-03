/** Minimal mutable-free 2D vector helpers. Plain objects keep the sim data trivially
 *  serializable and easy to reason about for determinism. */
export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const lenSq = (a: Vec2): number => a.x * a.x + a.y * a.y;

export function normalize(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

/** Clamp a vector's magnitude to at most `max`. */
export function limit(a: Vec2, max: number): Vec2 {
  const l = Math.hypot(a.x, a.y);
  if (l > max && l > 1e-9) {
    const s = max / l;
    return { x: a.x * s, y: a.y * s };
  }
  return a;
}

/** Set a vector's magnitude to exactly `m` (direction preserved). */
export function setMag(a: Vec2, m: number): Vec2 {
  return scale(normalize(a), m);
}

/** Rotate 90° left (perpendicular), used by tangential bias. */
export function perpLeft(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x };
}

/** Toroidal shortest displacement from a to b on a wrapped world. */
export function wrapDelta(a: Vec2, b: Vec2, w: number, h: number): Vec2 {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (dx > w * 0.5) dx -= w;
  else if (dx < -w * 0.5) dx += w;
  if (dy > h * 0.5) dy -= h;
  else if (dy < -h * 0.5) dy += h;
  return { x: dx, y: dy };
}

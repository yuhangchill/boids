import type { Band, BoidsConfig } from "../shared/types.js";
import { Flock } from "../sim/flock.js";

export type LookMode = "particle" | "species";

interface Rgb { r: number; g: number; b: number; }

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbStr(c: Rgb): string { return `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`; }

/** Sample a gradient's stops (sorted by pos) at t in [0,1]. */
function sampleStops(stops: { hex: string; pos: number }[], t: number): Rgb {
  if (stops.length === 0) return { r: 128, g: 128, b: 128 };
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  if (t <= s[0].pos) return hexToRgb(s[0].hex);
  if (t >= s[s.length - 1].pos) return hexToRgb(s[s.length - 1].hex);
  for (let i = 0; i < s.length - 1; i++) {
    if (t >= s[i].pos && t <= s[i + 1].pos) {
      const span = s[i + 1].pos - s[i].pos || 1;
      const f = (t - s[i].pos) / span;
      const a = hexToRgb(s[i].hex);
      const b = hexToRgb(s[i + 1].hex);
      return { r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f };
    }
  }
  return hexToRgb(s[s.length - 1].hex);
}

export class Preview {
  private ctx: CanvasRenderingContext2D;
  private flock: Flock | null = null;
  private band: Band | null = null;
  private config: BoidsConfig | null = null;
  private look: LookMode = "particle";
  private running = true;
  private reseedOffset = 0;
  private raf = 0;
  private lastFpsT = 0;
  private frames = 0;
  private boidColors: string[] = [];

  onFps: (fps: number) => void = () => {};
  onCaption: (text: string) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  setConfig(cfg: BoidsConfig): void {
    this.config = cfg;
  }

  selectGroup(bandIndex: number): void {
    if (!this.config) return;
    this.band = this.config.bands[bandIndex] ?? null;
    this.rebuild();
  }

  setLook(look: LookMode): void {
    this.look = look;
    this.updateCaption();
  }

  togglePlay(): boolean {
    this.running = !this.running;
    if (this.running) this.loop(performance.now());
    return this.running;
  }

  reseed(): void {
    this.reseedOffset++;
    this.rebuild();
  }

  /** Re-read the current band (after edits) and rebuild the sim from a fresh seed. */
  refreshBand(): void {
    this.rebuild();
  }

  private rebuild(): void {
    if (!this.config || !this.band) return;
    const seed = (this.config.meta.seed + this.band.index * 7919 + this.reseedOffset * 104729) >>> 0;
    this.flock = new Flock({ core: this.config.core, addedRules: this.band.addedRules, seed });
    // Assign a stable per-boid color sampled across the group's gradient.
    const n = this.flock.boids.length;
    this.boidColors = this.flock.boids.map((bo, i) => {
      const t = this.band!.gradient.stops.length > 1 ? i / (n - 1) : 0.5;
      const jitter = (bo.rank - 0.5) * 0.12;
      return rgbStr(sampleStops(this.band!.gradient.stops, Math.max(0, Math.min(1, t + jitter))));
    });
    this.updateCaption();
  }

  private updateCaption(): void {
    if (!this.band) return;
    const rules = this.band.addedRules.map((r) => `${r.name} (${r.emergent})`).join(", ") || "core three only";
    const look = this.look === "particle" ? "particle layer — black dots on a pure white background" : "species layer — recognizable rendering";
    this.onCaption(`${this.band.label}: ${look}. Added rules: ${rules}.`);
  }

  start(): void {
    this.running = true;
    this.lastFpsT = performance.now();
    this.loop(this.lastFpsT);
  }

  private loop = (t: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.flock) {
      this.flock.step();
      this.render();
    }
    this.frames++;
    if (t - this.lastFpsT >= 500) {
      this.onFps(Math.round((this.frames * 1000) / (t - this.lastFpsT)));
      this.frames = 0;
      this.lastFpsT = t;
    }
  };

  private render(): void {
    if (!this.flock || !this.config || !this.band) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const sx = W / this.config.core.world.width;
    const sy = H / this.config.core.world.height;

    if (this.look === "particle") {
      // Locked look: pure white ground, black points. Not a generic "black & white".
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#000000";
      const r = Math.max(1.4, W * 0.003);
      for (const b of this.flock.boids) {
        ctx.beginPath();
        ctx.arc(b.pos.x * sx, b.pos.y * sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      this.renderSpecies(ctx, W, H, sx, sy);
    }
  }

  private renderSpecies(ctx: CanvasRenderingContext2D, W: number, H: number, sx: number, sy: number): void {
    const band = this.band!;
    // Multi-color gradient background.
    const rad = (band.gradient.angle * Math.PI) / 180;
    const cx = W / 2, cy = H / 2;
    const dx = Math.cos(rad) * W, dy = Math.sin(rad) * H;
    const grad = ctx.createLinearGradient(cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2);
    const stops = [...band.gradient.stops].sort((a, b) => a.pos - b.pos);
    if (stops.length === 1) {
      grad.addColorStop(0, stops[0].hex); grad.addColorStop(1, stops[0].hex);
    } else {
      for (const s of stops) grad.addColorStop(Math.max(0, Math.min(1, s.pos)), s.hex);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const size = Math.max(5, W * 0.011);
    for (let i = 0; i < this.flock!.boids.length; i++) {
      const b = this.flock!.boids[i];
      const ang = Math.atan2(b.vel.y, b.vel.x);
      const x = b.pos.x * sx, y = b.pos.y * sy;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = this.boidColors[i] ?? "#222";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 0.6;
      // Rough oriented "creature": teardrop body + tail. A reference glyph, not
      // the production species renderer.
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.quadraticCurveTo(0, size * 0.6, -size * 0.9, size * 0.35);
      ctx.quadraticCurveTo(-size * 0.5, 0, -size * 0.9, -size * 0.35);
      ctx.quadraticCurveTo(0, -size * 0.6, size, 0);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

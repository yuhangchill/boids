import type { BoidsConfig } from "../shared/types.js";
import rulesLib from "../../data/rules.json";
import xkcdColors from "../../data/xkcd-colors.json";

export interface RuleLibEntry {
  id: string;
  name: string;
  emergent: string;
  description: string;
  params: Record<string, number>;
}

export const RULE_LIBRARY: RuleLibEntry[] = (rulesLib.library as unknown as RuleLibEntry[]).map((r) => ({
  id: r.id,
  name: r.name,
  emergent: r.emergent,
  description: r.description,
  params: r.params,
}));

export const XKCD: Record<string, string> = xkcdColors as Record<string, string>;

/** Nearest xkcd color name to an arbitrary hex, for provenance when hex is edited. */
export function nearestColorName(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  let best = "";
  let bestD = Infinity;
  for (const [name, h] of Object.entries(XKCD)) {
    const [r2, g2, b2] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

export class Store {
  config: BoidsConfig | null = null;
  dirty = false;

  async load(): Promise<BoidsConfig> {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Failed to load config (${res.status})`);
    }
    this.config = (await res.json()) as BoidsConfig;
    this.dirty = false;
    return this.config;
  }

  async save(): Promise<void> {
    if (!this.config) return;
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(this.config),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Save failed (${res.status})`);
    }
    this.dirty = false;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Recompute band membership from per-animal scores after a boundary edit.
   * Pure client-side (no embeddings) — bands are score intervals, so moving a
   * boundary just reassigns animals. Gradient/traits/rules are per-band design
   * attributes and are intentionally left as-is for the human to tune.
   */
  reassignBands(): void {
    const cfg = this.config;
    if (!cfg) return;
    const bands = cfg.bands;
    for (const a of cfg.animals) {
      let idx = bands.findIndex((b) => a.score <= b.scoreMax && a.score > b.scoreMin);
      if (idx === -1) idx = a.score > bands[0].scoreMax ? 0 : bands.length - 1;
      a.band = idx;
    }
    for (const b of bands) {
      b.members = cfg.animals
        .filter((a) => a.band === b.index)
        .sort((x, y) => y.score - x.score)
        .map((a) => a.name);
    }
  }
}

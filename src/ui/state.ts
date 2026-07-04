// Review-UI state: one config object, explicit dirty flag, real-file
// persistence through the dev server (never localStorage — config.json is
// the lock between curation and show).

import type { BoidsConfig } from '../config/schema';

type Listener = (kind: ChangeKind) => void;
export type ChangeKind = 'structure' | 'group' | 'meta';

export class Store {
  cfg: BoidsConfig;
  dirty = false;
  /** Group currently loaded in the preview window. */
  previewGroup = 0;
  /** Index of the group touched by the most recent 'group' change. */
  lastChangedGroup = -1;
  private listeners = new Set<Listener>();

  constructor(cfg: BoidsConfig) {
    this.cfg = cfg;
  }

  onChange(fn: Listener): void {
    this.listeners.add(fn);
  }

  touch(kind: ChangeKind): void {
    this.dirty = true;
    for (const fn of this.listeners) fn(kind);
  }

  /** Notify without dirtying (e.g. preview group switch). */
  signal(kind: ChangeKind): void {
    for (const fn of this.listeners) fn(kind);
  }

  async save(): Promise<void> {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.cfg),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    this.dirty = false;
    for (const fn of this.listeners) fn('meta');
  }
}

export async function fetchConfig(): Promise<BoidsConfig | null> {
  const res = await fetch('/api/config');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`config load failed: ${res.status}`);
  return (await res.json()) as BoidsConfig;
}

// -- tiny DOM helpers (no framework: four helpers carry the whole UI) --

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function frag(...children: (Node | string)[]): DocumentFragment {
  const f = document.createDocumentFragment();
  f.append(...children);
  return f;
}

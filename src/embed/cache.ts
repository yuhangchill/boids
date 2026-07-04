// On-disk embedding cache (node-only, curation-time). Real files, never
// localStorage. One Float32 .bin per text under .cache/embeddings/<model>/,
// keyed by sha256(text), with an index.json for human inspection.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EmbeddingProvider } from './provider';

export class CachedProvider implements EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dim: number;
  private dir: string;
  private index: Record<string, string> = {};

  constructor(
    private inner: EmbeddingProvider,
    cacheRoot: string,
  ) {
    this.name = inner.name;
    this.model = inner.model;
    this.dim = inner.dim;
    this.dir = join(cacheRoot, `${inner.name}-${inner.model}`);
  }

  private key(text: string): string {
    return createHash('sha256').update(text).digest('hex').slice(0, 32);
  }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    await mkdir(this.dir, { recursive: true });
    const out: (Float32Array | null)[] = new Array(texts.length).fill(null);
    const misses: { i: number; text: string }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const file = join(this.dir, this.key(texts[i]) + '.bin');
      try {
        const buf = await readFile(file);
        out[i] = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
      } catch {
        misses.push({ i, text: texts[i] });
      }
    }

    if (misses.length > 0) {
      const fresh = await this.inner.embed(misses.map((m) => m.text));
      for (let j = 0; j < misses.length; j++) {
        const { i, text } = misses[j];
        out[i] = fresh[j];
        const k = this.key(text);
        this.index[k] = text;
        await writeFile(join(this.dir, k + '.bin'), Buffer.from(fresh[j].buffer));
      }
      await this.writeIndex();
    }
    return out as Float32Array[];
  }

  private async writeIndex(): Promise<void> {
    const file = join(this.dir, 'index.json');
    let existing: Record<string, string> = {};
    try {
      existing = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      /* first write */
    }
    await writeFile(file, JSON.stringify({ ...existing, ...this.index }, null, 2) + '\n');
  }
}

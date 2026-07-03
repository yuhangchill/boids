import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * On-disk embedding cache (a real file, never localStorage). Keyed by
 * sha256(model + "\n" + text) so re-running curation never re-pays the API for
 * text it has already embedded. One JSON map per model under .cache/embeddings/.
 */
export class EmbeddingCache {
  private map = new Map<string, number[]>();
  private readonly file: string;
  private dirty = false;

  constructor(model: string, root = process.cwd()) {
    const safe = model.replace(/[^a-z0-9._-]/gi, "_");
    this.file = resolve(root, ".cache", "embeddings", `${safe}.json`);
  }

  private key(text: string): string {
    return createHash("sha256").update(text).digest("hex");
  }

  async load(): Promise<void> {
    if (!existsSync(this.file)) return;
    try {
      const raw = await readFile(this.file, "utf8");
      const obj = JSON.parse(raw) as Record<string, number[]>;
      for (const [k, val] of Object.entries(obj)) this.map.set(k, val);
    } catch {
      // Corrupt cache is non-fatal; we just re-embed and overwrite.
    }
  }

  get(text: string): number[] | undefined {
    return this.map.get(this.key(text));
  }

  set(text: string, vec: number[]): void {
    this.map.set(this.key(text), vec);
    this.dirty = true;
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    await mkdir(dirname(this.file), { recursive: true });
    const obj: Record<string, number[]> = {};
    for (const [k, val] of this.map) obj[k] = val;
    await writeFile(this.file, JSON.stringify(obj), "utf8");
    this.dirty = false;
  }

  get size(): number {
    return this.map.size;
  }
}

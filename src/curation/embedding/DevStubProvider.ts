import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./EmbeddingProvider.js";

/**
 * DEV STUB — NOT a real embedding model, and NOT a local ML model. It is a
 * deterministic hashed bag-of-words vectorizer used only when no API key is
 * present, so the whole pipeline (banding, color pick, word→rule mapping, the
 * preview) runs and can be inspected offline.
 *
 * What it does: each lowercased token maps to a fixed pseudo-random unit vector
 * (seeded by a hash of the token); a text's vector is the normalized sum of its
 * token vectors. Consequence: texts that SHARE WORDS look similar; texts that
 * don't are ~orthogonal. That makes word→rule matching demonstrable offline
 * (rule descriptions deliberately contain their trait words), but the
 * beloved→reviled ranking of animal NAMES is essentially arbitrary — real
 * semantics require the OpenAI provider.
 */
export class DevStubProvider implements EmbeddingProvider {
  readonly id = "devstub";
  readonly model: string;
  private readonly dim: number;
  private tokenCache = new Map<string, number[]>();

  constructor(dim = 512) {
    this.dim = dim;
    this.model = `devstub-bow-${dim}`;
  }

  private tokenVec(token: string): number[] {
    const cached = this.tokenCache.get(token);
    if (cached) return cached;
    // Deterministic vector from the token hash: expand sha256 bytes into ±values.
    const vec = new Array(this.dim).fill(0);
    let counter = 0;
    let filled = 0;
    while (filled < this.dim) {
      const h = createHash("sha256").update(`${token}#${counter++}`).digest();
      for (let i = 0; i < h.length && filled < this.dim; i += 2) {
        // Two bytes -> a value in [-1, 1).
        const u = ((h[i] << 8) | h[i + 1]) / 65536;
        vec[filled++] = u * 2 - 1;
      }
    }
    // Normalize each token vector so bag-of-words cosine ≈ shared-token overlap.
    let mag = 0;
    for (const x of vec) mag += x * x;
    mag = Math.sqrt(mag) || 1;
    for (let i = 0; i < vec.length; i++) vec[i] /= mag;
    this.tokenCache.set(token, vec);
    return vec;
  }

  private embedOne(text: string): number[] {
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const out = new Array(this.dim).fill(0);
    for (const t of tokens) {
      const tv = this.tokenVec(t);
      for (let i = 0; i < this.dim; i++) out[i] += tv[i];
    }
    let mag = 0;
    for (const x of out) mag += x * x;
    mag = Math.sqrt(mag) || 1;
    for (let i = 0; i < this.dim; i++) out[i] /= mag;
    return out;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }
}

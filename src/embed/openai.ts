// OpenAI embeddings over plain fetch — no SDK dependency needed for one
// endpoint. Batched, with retry/backoff on 429/5xx. Vectors from
// text-embedding-3-* are unit norm already; we normalize anyway for safety.

import type { EmbeddingProvider } from './provider';
import { normalize } from './provider';

const BATCH = 128;
const MAX_RETRIES = 5;

export class OpenAIProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dim: number;

  constructor(
    private apiKey: string,
    readonly model: string = 'text-embedding-3-large',
  ) {
    this.dim = model === 'text-embedding-3-small' ? 1536 : 3072;
  }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const data = await this.request(batch);
      for (const item of data) out.push(normalize(Float32Array.from(item.embedding)));
    }
    return out;
  }

  private async request(input: readonly string[]): Promise<{ embedding: number[] }[]> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
        return json.data.sort((a, b) => a.index - b.index);
      }
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= MAX_RETRIES) {
        throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const wait = Math.min(16000, 500 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

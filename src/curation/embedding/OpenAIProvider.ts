import type { EmbeddingProvider } from "./EmbeddingProvider.js";

const ENDPOINT = "https://api.openai.com/v1/embeddings";
const BATCH = 256;

/**
 * Real default provider: OpenAI text-embedding-3-large via the REST API.
 * The projection (dot product) is computed by us from the returned vectors —
 * there is no separate similarity endpoint.
 */
export class OpenAIProvider implements EmbeddingProvider {
  readonly id = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly dimensions?: number;

  constructor(opts: { apiKey: string; model?: string; dimensions?: number }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "text-embedding-3-large";
    this.dimensions = opts.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const vecs = await this.embedBatch(batch);
      out.push(...vecs);
    }
    return out;
  }

  private async embedBatch(batch: string[], attempt = 0): Promise<number[][]> {
    const body: Record<string, unknown> = { model: this.model, input: batch };
    if (this.dimensions) body.dimensions = this.dimensions;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const retriable = res.status === 429 || res.status >= 500;
      if (retriable && attempt < 5) {
        const wait = Math.min(2000 * 2 ** attempt, 20000);
        await new Promise((r) => setTimeout(r, wait));
        return this.embedBatch(batch, attempt + 1);
      }
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings failed: ${res.status} ${res.statusText} ${text}`);
    }

    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    // Sort by index to guarantee input order regardless of response ordering.
    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

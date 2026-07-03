import type { EmbeddingProvider } from "./EmbeddingProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";
import { DevStubProvider } from "./DevStubProvider.js";
import { EmbeddingCache } from "./cache.js";

export type { EmbeddingProvider };

/**
 * Pick the provider from env. Default to OpenAI whenever OPENAI_API_KEY is set;
 * otherwise fall back to the clearly-labeled dev stub so offline runs still work.
 * EMBEDDING_PROVIDER can force either explicitly.
 */
export function createProvider(): EmbeddingProvider {
  const forced = process.env.EMBEDDING_PROVIDER?.toLowerCase();
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.EMBEDDING_MODEL;
  const dim = process.env.EMBEDDING_DIM ? Number(process.env.EMBEDDING_DIM) : undefined;

  const useOpenAI = forced === "openai" || (!forced && !!key);
  if (useOpenAI) {
    if (!key) throw new Error("EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set.");
    return new OpenAIProvider({ apiKey: key, model, dimensions: dim });
  }

  console.warn(
    "\n⚠️  Using the DEV STUB embedding provider (no OPENAI_API_KEY).\n" +
      "   The pipeline will run end-to-end, but the beloved→reviled ranking is\n" +
      "   NOT semantically meaningful. Set OPENAI_API_KEY for real results.\n"
  );
  return new DevStubProvider(dim ?? 512);
}

/** Provider + on-disk cache: embed a de-duplicated set of strings, cache misses. */
export class Embedder {
  readonly provider: EmbeddingProvider;
  private cache: EmbeddingCache;

  constructor(provider: EmbeddingProvider) {
    this.provider = provider;
    this.cache = new EmbeddingCache(provider.model);
  }

  async embedMany(texts: string[]): Promise<Map<string, number[]>> {
    await this.cache.load();
    const unique = [...new Set(texts)];
    const misses = unique.filter((t) => !this.cache.get(t));

    if (misses.length > 0) {
      console.log(
        `Embedding ${misses.length} new string(s) via ${this.provider.id} (${this.provider.model}); ` +
          `${unique.length - misses.length} cached.`
      );
      const vecs = await this.provider.embed(misses);
      misses.forEach((t, i) => this.cache.set(t, vecs[i]));
      await this.cache.save();
    } else {
      console.log(`All ${unique.length} string(s) served from cache.`);
    }

    const out = new Map<string, number[]>();
    for (const t of unique) {
      const v = this.cache.get(t);
      if (v) out.set(t, v);
    }
    return out;
  }
}

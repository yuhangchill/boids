// Deterministic offline stub — PLUMBING ONLY. Its rankings are meaningless;
// it exists so the pipeline runs end-to-end without a key. Real curation
// requires OPENAI_API_KEY.

import type { EmbeddingProvider } from './provider';
import { normalize } from './provider';
import { hash32, mulberry32 } from '../sim/prng';

const DIM = 256;

export class DevStubProvider implements EmbeddingProvider {
  readonly name = 'devstub';
  readonly model = 'devstub-hash-256';
  readonly dim = DIM;

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    return texts.map((t) => {
      const rng = mulberry32(hash32(t.toLowerCase().trim()));
      const v = new Float32Array(DIM);
      for (let i = 0; i < DIM; i++) v[i] = rng() * 2 - 1;
      return normalize(v);
    });
  }
}

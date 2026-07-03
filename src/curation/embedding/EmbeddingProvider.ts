/**
 * Swappable embedding backend. The pipeline depends only on this interface, so a
 * different model/service (or the offline dev stub) drops in without touching
 * curation logic. Embedding happens at curation-time ONLY; the show is offline.
 */
export interface EmbeddingProvider {
  /** Stable id for provenance in config.meta.provider (e.g. "openai", "devstub"). */
  readonly id: string;
  /** Model name recorded in config.meta.model. */
  readonly model: string;
  /**
   * Embed a batch of strings. Order of outputs matches order of inputs.
   * Implementations should batch/limit requests internally as needed.
   */
  embed(texts: string[]): Promise<number[][]>;
}

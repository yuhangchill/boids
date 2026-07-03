import { cosine } from "../shared/vecmath.js";

export interface RankedWord {
  word: string;
  sim: number;
}

/** Rank a candidate word list by cosine to a group concept vector; take top N. */
export function topByCosine(
  concept: number[],
  words: string[],
  embeddings: Map<string, number[]>,
  n: number
): RankedWord[] {
  const ranked: RankedWord[] = [];
  for (const word of words) {
    const vec = embeddings.get(word);
    if (!vec) continue;
    ranked.push({ word, sim: cosine(concept, vec) });
  }
  ranked.sort((a, b) => b.sim - a.sim);
  return ranked.slice(0, n);
}

import type { Endpoints } from "../shared/types.js";
import { subVec, unit } from "../shared/vecmath.js";

/**
 * The beloved→reviled axis is a SINGLE direction from two endpoint words:
 *   V_axis = E(positiveWord) - E(negativeWord)
 * No basket of emotion words, no "human" anchor. Returned as a unit vector so a
 * projection is a plain dot product.
 */
export function buildAxis(endpoints: Endpoints, embeddings: Map<string, number[]>): number[] {
  const pos = embeddings.get(endpoints.positiveWord);
  const neg = embeddings.get(endpoints.negativeWord);
  if (!pos || !neg) {
    throw new Error(
      `Axis endpoints not embedded: "${endpoints.positiveWord}" / "${endpoints.negativeWord}"`
    );
  }
  return unit(subVec(pos, neg));
}

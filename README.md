# Boids

An installation that treats a language model's embedding space as a proxy for collective
human perception, ranking animals from **beloved to reviled** and letting each group flock
with identical core logic — so the divergence in the viewer's own feeling becomes the exhibit.

- [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) — authoritative intent: concept, method, and all
  locked decisions. Read it in full before building anything.
- [`DECISIONS.md`](DECISIONS.md) — running log: one line per non-obvious choice, with the reason.
- `config.json` — **the lock between curation and show.** The pipeline writes it, the review
  UI edits it, the show reads it offline. Nothing re-embeds at runtime.

This branch (`fable5-a2`) is the v1 build: the curation pipeline plus a review UI with a
rough live preview. Production deployment (five dual-layer windows, Electron, registration)
is a later pass.

## Run

```
npm install
cp .env.example .env        # put OPENAI_API_KEY in .env
npm run curate              # embeds vocabulary, writes config.json (cached in .cache/)
npm run dev                 # review UI + live preview at http://localhost:5173
```

Without a key the pipeline falls back to a deterministic offline stub — plumbing only, its
rankings are meaningless. Endpoint words swap via env: `AXIS_POSITIVE` / `AXIS_NEGATIVE`
(default `beloved` / `reviled`), then re-run curate. A `locked` config is never overwritten
(`npm run curate -- --force` overrides).

## What curation does

1. axis = `E(positive) − E(negative)`, one direction from two endpoint words
2. every animal scored by projection onto the unit axis (vectors are unit norm, so cosine)
3. sorted, then cut into **five bands** at rough quintiles — cuts are score values, editable
   by dragging the band rules in the UI spine
4. per band: a multi-stop **gradient** (stop count 3–8 tracks member density; each stop is
   the xkcd color name nearest the member at that quantile), **trait words** (contrastive
   cosine against the all-animals centroid; relationship words primary, motion words
   cross-check), and a **rule composition** (top-3 abstract relational rules by proximity of
   their one-line descriptions to the trait words, weights and params seeded, all editable)

The three iron laws (separation / alignment / cohesion) are constants in `src/sim/flock.ts`,
identical for every group, deliberately outside the config.

## config.json schema (v1)

```jsonc
{
  "version": 1,
  "generatedAt": "ISO date",
  "locked": false,                    // review UI toggles; curate respects it
  "embedding": { "provider": "openai", "model": "text-embedding-3-large", "dim": 3072 },
  "axis": { "positive": "beloved", "negative": "reviled" },
  "animals": [ { "name": "dog", "score": 0.123 } ],     // sorted, beloved first
  "bandCuts": [ 0.086, 0.061, 0.038, 0.012 ],           // 4 descending score cuts → 5 bands
  "groups": [ {
    "index": 0, "label": "I",
    "members": [ "…" ],                                 // resolved from bandCuts
    "gradient": [ { "at": 0, "name": "butter", "hex": "#ffff81", "anchor": "butterfly" } ],
    "traits": {
      "relationship": [ { "word": "sociable", "affinity": 0.016 } ],
      "motion":       [ { "word": "soaring",  "affinity": 0.009 } ]
    },
    "rules": [ { "id": "density-targeting", "weight": 0.85, "params": { "target": 5, "gain": 1 } } ],
    "sim": { "count": 192, "maxSpeed": 88, "seed": 1937233269 }
  } ]
}
```

Rule ids: `selective-coupling`, `asymmetric-influence`, `phase-sync`, `density-targeting`,
`tangential-bias`, `startle-scatter`, `independence`, `intergroup` — defined with their
one-line formulas in `src/sim/rules.ts`.

## Layout

```
data/       animals (open list), xkcd colors, trait lexicons — curation-time vocabulary
src/embed/  EmbeddingProvider: openai | devstub, disk cache
src/curate/ pipeline steps (env, banding, gradients, traits, words→rules)
src/curate.ts        entry: npm run curate
src/sim/    deterministic flock (iron laws + rule library), seeded PRNG
src/render/ reference renderer: particle look / species look, one context
src/ui/     review UI: spine (ranked axis, draggable cuts), five band plates, window
```

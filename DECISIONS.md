# DECISIONS

Running log of non-obvious choices, one line each with the reason. `PROJECT_BRIEF.md`
holds intent (the *why* at large); this file records the *how* decisions a future agent
could not recover from code alone. `config.json` is the lock between curation and show.

## Architecture

- **Vite + vanilla TypeScript, no UI framework** — the preview is a canvas sim and the
  review is a form; a framework adds weight for no gain and keeps the eventual offline show
  trivially portable (it only needs `config.json` + the `src/sim` modules).
- **Two entry points, one repo**: `npm run curate` (Node/tsx, API-time) writes `config.json`;
  `npm run dev` (Vite) serves the review+preview UI. This mirrors the brief's hard boundary —
  embedding is curation-time only, the show is offline.
- **The only server dependency is a tiny config read/write endpoint** (Vite middleware in
  `vite.config.ts`). It exists so the human can lock edits back to a real file; the show never
  uses it. Chosen over `localStorage` because the brief forbids depending on `localStorage`.
- **Embedding cache is a real on-disk file** (`.cache/embeddings/<model>.json`), keyed by
  `sha256(model + text)`, so re-running curation never re-pays the API. Not `localStorage`.

## Embeddings & the axis

- **`EmbeddingProvider` interface with two implementations** — `OpenAIProvider`
  (`text-embedding-3-large`, the real default) and `DevStubProvider`. The provider is chosen at
  runtime: OpenAI whenever `OPENAI_API_KEY` is set, else the stub (overridable via
  `EMBEDDING_PROVIDER`).
- **`DevStubProvider` is a deterministic hashed bag-of-words vectorizer, NOT a local embedding
  model** (the brief forbids a local model). It is a plumbing/test stub so the whole pipeline and
  preview run offline. Consequence: word→rule matching is demonstrable offline (rule descriptions
  contain their trait words on purpose), but the animal ranking is not semantically meaningful.
  `config.meta.notes` flags any stub-generated config loudly.
- **Axis = `unit(E(positiveWord) − E(negativeWord))`**, endpoints in
  `data/curation.settings.json` (`beloved`/`reviled`), swappable in one line. No emotion-word
  basket, no `human` anchor. Score = dot product of an animal's embedding with the unit axis
  (computed by us; there is no similarity endpoint).
- **All embedded strings are English** (animals, endpoints, color names, trait words, rule
  descriptions) — the intended English/Western cultural lens. The pipeline is nonetheless
  language-parameterized (swap the vocab files) for a future zh/en comparison.

## Banding, colors, traits

- **Five bands are equal-width intervals over a robust [p2, p98] score range**, not equal-count.
  Equal-width is deliberate: it makes *density* vary across bands, and that variation is exactly
  what the brief ties gradient richness to. Boundaries are stored as editable `scoreMin/scoreMax`.
- **Band membership is recomputed client-side when a boundary is edited** (bands are just score
  intervals). Gradient/traits/rules are left as curated seeds for the human to tune — recomputing
  them would need embeddings, which the UI intentionally lacks.
- **Gradient stop count scales with band density** (`sqrt(members / maxMembers)` mapped to
  [minStops, maxStops]) so sparse bands get a simple wash and dense bands a rich blend.
- **Colors are picked by embedding proximity to the group centroid, then a farthest-point pass**
  in RGB for visual variety (top matches are often near-duplicate hues). Stops are ordered by
  luminance for a smooth ramp. Resolved hex is stored; runtime never re-embeds.
- **Group concept = centroid of member embeddings**; for a sparse/empty band it falls back to an
  axis-position blend of the two endpoint vectors.
- **Trait words per group = top-N relationship words (primary) and motion words (secondary) by
  cosine to the group centroid.**

## Flocking rules (the conceptual core)

- **Core three (separation/alignment/cohesion) live in `config.core`, identical for every group**
  and never stored per band — the brief's "identical logic and identical grace." Base kinematics
  (count, speed, perception) are shared too, so the *only* thing that differs between a beloved
  and a reviled flock is the set of added abstract rules.
- **The rule library is small and Reynolds-level** (`data/rules.json`): selective coupling,
  asymmetric influence, phase synchronization, density targeting, tangential bias,
  startle/scatter, independence, inter-group bias. Each is a simple local neighbor-relative
  formula. Curation only *selects and weights* rules — it never synthesizes new ones — to guard
  against rules collapsing into scripted behavior.
- **Rules act by three mechanisms, all local**: neighbor-weighting modifiers on the core coupling
  (selective, asymmetric, independence), added forces (density, tangential, startle, inter-group),
  and per-agent kinematic modulation (phase → speed pulsing). Distinctive movement (milling,
  scattering, sub-flocks) *emerges*; nothing is drawn from a motion verb.
- **Word→rule mapping is vector-space only in v1** (`0.7·relationship + 0.3·motion` proximity,
  top-K above a threshold, weight ∝ normalized proximity). An LLM-assisted mapping is a later pass.
- **`intergroup_bias` is latent in the single-group preview** (steered against a fixed notional
  center) and stored for the eventual multi-group show.

## Review UI design

- **The tool is ink-on-paper**: pure white ground, black type, hairline rules, square corners,
  no shadows — the review UI deliberately adopts the installation's own lower layer, so the only
  color on screen is the data itself (band gradient strips, color stops, the species preview).
- **Type carries all hierarchy**: a neutral grotesque for reading (prefers a locally installed
  ABC Diatype, falls back to Helvetica Neue — no webfont, the tool stays fully offline), a mono
  for every measured value, and one uppercase letterspaced micro-label voice for section heads.
  The five bands read as a numbered catalogue (01–05) under a full-width beloved→reviled axis
  spine; each band's gradient renders as a print-production color bar at full measure.

## Determinism & preview

- **Fixed unit timestep + seeded mulberry32 PRNG.** Per-group preview seed =
  `meta.seed + bandIndex·7919 (+ reseed·104729)`, so each group is reproducible yet distinct. The
  preview steps exactly once per animation frame (no wall-clock scaling) to preserve reproducibility.
- **One sim, one canvas, one layer look at a time** — particle look is literally "black dots on a
  pure white background" (pure white ground, black points, labeled exactly); species look is a
  rough oriented colored glyph over the group gradient. It is a reference for judging choices, not
  the production renderer. Positions are never streamed between windows.

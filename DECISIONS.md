# DECISIONS

Running log of non-obvious choices, one line each with the reason. `PROJECT_BRIEF.md`
holds intent (the *why* at large); this file records the *how* decisions a future agent
could not recover from code alone. `config.json` is the lock between curation and show.

## fable5-a2

- Kept the pre-scaffolded data files (`data/animals.ts` 333 after dedup, `data/colors.ts` xkcd 949, `data/lexicon.ts`) and the vite `/api/config` persistence endpoint found in the working tree; all `src/` code written fresh.
- Trait words are picked **contrastively** (cos to band centroid **minus** cos to the all-animals centroid): raw cosine gave every band the same generic words because the "this is an animal" component dominates.
- Gradient stops sample the band itself: stop count 3–8 from member density, each stop = the xkcd color name nearest the member at that quantile — the gradient is a literal walk across the band's semantic terrain (band V producing vomit/diarrhea/rust was derived, not chosen).
- Iron-law constants (separation/alignment/cohesion radii and weights) live in `src/sim/flock.ts`, **not** in config, so the lock cannot vary them per group.
- v1 species look renders each agent as its species **name**: in a piece whose whole substance is language, the embedded word is the honest species-identity stand-in for a rough preview; production replaces words with recognizable imagery.
- Sim world is a fixed logical 1200×750, letterboxed to the canvas, so trajectories are independent of panel size (determinism across machines/windows).
- v1 words→rules mapping: rule one-liners are embedded; rule score = mean cos to relationship words + 0.4 × motion words; top 3 kept with weights min-max mapped to 0.30–0.85; `intergroup` excluded from auto-pick because the single-group preview gives it nothing to relate to (still addable by hand).
- Soft edge containment instead of torus wrap: the physical display frame exists; flocks negotiate the edge rather than teleporting through it.
- Rule params get small seeded jitter around defaults (snapped to each param's step) so five groups don't sit on identical numbers; everything stays editable.
- Live edits morph the running flock **without** reset so effects are judged in motion; count/seed changes rebuild; RESTART restores strict seed reproducibility.
- `npm run curate` refuses to overwrite a `locked` config without `--force` — the lock is enforced on both sides.
- Review UI is "the page is the axis": full-height ranked spine (beloved top, reviled bottom) with band cuts as draggable rules, five band plates, one preview window; chrome is achromatic and all screen color is data.
- Embedding cache: one Float32 `.bin` per string under `.cache/embeddings/`, so re-runs cost nothing and endpoint-word swaps only embed what's new.

# embedding-space

A side study for Boids: ~5,000 words — human social appellations and creature names —
embedded, projected to 3D with UMAP, and shown as a quiet additive point field
(3b1b-lineage look: near-black ground, glowing translucent points).

- **Creatures** render as translucent white; **human appellations** carry a warm amber.
- No word is shown except one: the point for **“human”** carries its label.
- Drag to orbit, scroll to zoom — every input event renders exactly one frame
  (rAF-coalesced), so the scene is fully idle the moment the hand stops. The panel
  takes precise numeric values (azimuth / elevation / distance / field of view /
  point size); **Update view** plays a single eased transition, then idles.

## Pipeline

```sh
python3 pipeline/build_words.py     # WordNet → data/words.json  (offline, deterministic)
python3 pipeline/embed_project.py   # OpenAI → UMAP → web/points.js
python3 -m http.server -d web 8360  # open http://localhost:8360
```

Requirements: `numpy`, `requests`, `nltk` (WordNet downloads on first run),
`umap-learn`, and `OPENAI_API_KEY` in the repo-root `.env` (repo convention).

## Decisions

- **Vocabulary** from WordNet hyponym closures — `person.n.01` for appellations,
  `animal.n.01` for creatures — single lowercase words only; words in both closures
  (queen, drone, mule…) count as human. Deterministic seed.
- **Embeddings**: `text-embedding-3-small` at **256 dimensions** — the lowest
  benchmark-validated size for the v3 models; cost for the full vocabulary is a
  fraction of a cent. Raw vectors cached in `data/embeddings.npy` (git-ignored)
  so UMAP re-runs never re-bill.
- **UMAP** to 3D, cosine metric, `n_neighbors=15`, `min_dist=0.08`, seeded.
- **Viewer** is dependency-free WebGL2 (`web/index.html`), `low-power` context,
  device-pixel-ratio capped at 2, renders only on update/resize.

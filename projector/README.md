# projector

An interactive embedding-space instrument in the TensorFlow Embedding Projector
lineage — dark ground, glowing point field — built to *read* the Boids question
directly: where does collective affection sit in an LLM's semantic space?

The same 5,000 words as `embedding-space/` (2,000 human appellations + 3,000
creature names), the same cached 256-d `text-embedding-3-small` vectors and
UMAP 3D layout. Nothing is re-billed; the only new API spend is ~40 axis-anchor
words (once, cached) and any custom terms you type into the arithmetic panel
(each billed once, then cached).

## Run

```sh
python3 pipeline/precompute.py   # derives axis/quintiles from cached study data
python3 server.py                # http://localhost:8420  (static + /api/embed)
```

Requires the `embedding-space/` study data (`words.json`, `embeddings.npy`,
`points.json`) and `OPENAI_API_KEY` in the repo-root `.env` (repo convention).

## What it shows

- **The beloved→reviled axis**, computed in the original 256-d space as the
  centroid difference of 12 + 12 affection anchors, then drawn in UMAP space
  as the least-squares line of position against score.
- **Five gates (I–V)** — equal-count quintiles of the 3,000 creatures along the
  axis, ringed at their median score with the quintile's median perpendicular
  spread; each quintile carries one step of the warm→cold gradient.
- **Group-living creatures** — a second axis (gregarious↔solitary anchors)
  marks the top 30%; the toggle recedes everything else.
- **Curated labels** — per quintile, the four group-living creatures nearest
  the gate: the words that would survive Boids' own funnel.
- Every layer (colours, gates, axis, group filter, labels, human appellations)
  is an independent switch.

## Selection semantics (learned from the TF Projector)

Idle: points only, plus the curated-label layer. Hover: one label. Selection:
the world recedes to grey, the selected word and its k nearest neighbors (in
the **original** 256-d space, cosine or euclidean, k = 5…100) light up with
rank-faded labels, and the panel lists them with distances.

**Word arithmetic:** with a word selected, add terms — `starling + boids +
behavior` — each `+`/`−` chip is flippable. Corpus words use their cached
vector; unknown terms go through `/api/embed` (one token apiece, cached in
`data/query-cache.json`). The composite query re-ranks the neighbor list and
places a dashed ghost marker at the similarity-weighted centroid of its
neighborhood.

## Decisions

- **Search is regex** (falls back to literal on invalid patterns), like TF's.
- **Render-on-demand**: the WebGL2 scene draws only during interaction or
  eased transitions — no idle GPU load (house rule from `embedding-space/`).
- **Additive glow needs an opaque canvas**: with a transparent GL canvas,
  premultiplied compositing clamps rgb > alpha, so the vignette ground is a
  GL fullscreen triangle, not CSS.
- The axis is *fitted*, not an axis of the projection: UMAP organizes mostly
  by taxonomy, so the affection direction cuts obliquely through the cloud and
  the five gates overlap — that tension is the honest picture.

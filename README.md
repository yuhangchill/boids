# Boids

An installation for VISAP that treats a language model's embedding space as a proxy for
collective human perception, ranking animals from **beloved to reviled** and letting each group
flock with identical core logic — so the divergence in the viewer's own feeling becomes the
exhibit. See [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) for the full intent and
[`DECISIONS.md`](DECISIONS.md) for the non-obvious choices.

This repo is **v1**: the curation pipeline plus a rough live preview. Not in v1: Electron, the
five-window/ten-image production deployment, dual-screen registration, camera interaction, and
LLM-based word→rule mapping.

## Setup

```bash
npm install
cp .env.example .env      # optional: add OPENAI_API_KEY for real embeddings
```

Without a key the pipeline runs on a **dev-stub** embedding provider so everything works offline,
but the ranking is not semantically meaningful (see `DECISIONS.md`). For real results, set
`OPENAI_API_KEY` (uses `text-embedding-3-large`).

## Curate → review → lock

```bash
npm run curate     # embeds, scores, bands, picks colors + trait words + rules → config.json
npm run dev        # opens the review UI + live preview at http://localhost:5173
```

In the UI:

- **Review** (left): the five bands, each with its members + scores, the multi-color gradient
  (editable stops), relationship/motion trait words, and added rules with weights + params. Edit
  band boundaries, gradients, words, and rules; **Save** writes back to `config.json`; **Lock**
  sets `meta.locked` (after which `npm run curate` refuses to overwrite without `--force`).
- **Preview** (right): deterministic 2D flocking for the selected group, toggling one layer look
  at a time — `black dots on a pure white background` (the particle layer) or the `species look`
  (colored oriented glyphs over the group gradient). Reseed re-runs from a fresh deterministic seed.

## Commands

| Command | What it does |
| --- | --- |
| `npm run curate` | Run the curation pipeline → `config.json`. `--force` overrides a lock. |
| `npm run dev` | Review UI + live preview (Vite). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Simulation determinism tests. |
| `npm run build` | Typecheck + production build of the UI into `dist/`. |

## Tuning curation

`data/curation.settings.json` holds every curation knob: axis endpoints, master seed, band
count/labels/range percentiles, gradient stop range, trait counts, rule-selection thresholds, and
the shared core simulation params. `data/animals.txt`, `data/lexicons/*.txt`, and
`data/rules.json` are the input vocabularies (all English). Re-run `npm run curate` after editing
any of these.

## `config.json` schema (the lock)

The show/runtime reads exactly this and needs no network. Types live in
[`src/shared/types.ts`](src/shared/types.ts).

```jsonc
{
  "meta": {
    "schemaVersion": 1,
    "generatedAt": "ISO-8601",
    "provider": "openai | devstub",
    "model": "text-embedding-3-large",
    "seed": 20260703,          // master PRNG seed; per-group preview derives from this
    "locked": false,           // when true, curate --force is required to overwrite
    "animalCount": 317,
    "notes": "…"               // present (a warning) only for dev-stub configs
  },
  "axis": { "positiveWord": "beloved", "negativeWord": "reviled" },

  // Iron laws + base kinematics — IDENTICAL for every group by design.
  "core": {
    "world": { "width": 1000, "height": 1000, "wrap": true },
    "timestep": 1.0,
    "boidCount": 220,
    "maxSpeed": 3.2, "minSpeed": 1.1, "maxForce": 0.09,
    "perceptionRadius": 62, "separationRadius": 22,
    "weights": { "separation": 1.7, "alignment": 1.0, "cohesion": 0.9 }
  },

  "bands": [
    {
      "index": 0,                       // 0 = most beloved … 4 = most reviled
      "label": "Beloved",
      "scoreMin": 0.047, "scoreMax": 0.129,   // editable score interval (position + width)
      "members": ["dog", "…"],                // most → least beloved within the band
      "gradient": {
        "angle": 135,
        "stops": [ { "name": "goldenrod", "hex": "#fac205", "pos": 0.0 }, /* … */ ]
      },
      "traits": {
        "relationship": ["tight-knit", "…"],  // primary word→rule input
        "motion": ["gliding", "…"]            // secondary cross-check
      },
      "addedRules": [
        {
          "id": "tangential_bias",
          "name": "Tangential bias",
          "emergent": "milling / circling",
          "weight": 0.7,                      // 0..1 blend on the rule's force
          "params": { "strength": 0.6, "sign": 1 },
          "proximity": 0.31                   // the match score that selected it
        }
      ]
    }
    // … 5 bands total
  ],

  "animals": [ { "name": "dog", "score": 0.42, "band": 0 } /* full ranked list */ ]
}
```

The core three rules (separation/alignment/cohesion) are always on and are **not** in
`addedRules`; per-group distinctiveness comes only from the added rules. See `src/sim/flock.ts`
for how they compose.

#!/usr/bin/env python3
"""Embed the vocabulary and project it to 3D.

  OpenAI text-embedding-3-small at 256 dimensions (the lowest
  benchmark-validated size for the v3 models) -> UMAP -> 3D -> web/points.js

Reads OPENAI_API_KEY from the repo-root .env (repo convention). Raw embeddings
are cached in data/embeddings.npy so re-running UMAP never re-bills the API.
"""

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import requests

MODEL = "text-embedding-3-small"
DIMS = 256
BATCH = 2048
SEED = 42

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parent
WORDS = HERE / "data" / "words.json"
CACHE = HERE / "data" / "embeddings.npy"
POINTS_JSON = HERE / "data" / "points.json"
POINTS_JS = HERE / "web" / "points.js"


def api_key():
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"]
    env = REPO / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line.startswith("OPENAI_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("no OPENAI_API_KEY in environment or repo .env")


def embed(words, key):
    if CACHE.exists():
        vecs = np.load(CACHE)
        if vecs.shape == (len(words), DIMS):
            print(f"using cached embeddings {vecs.shape} from {CACHE.name}")
            return vecs
    out = []
    for i in range(0, len(words), BATCH):
        chunk = words[i : i + BATCH]
        for attempt in range(5):
            r = requests.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": MODEL, "input": chunk, "dimensions": DIMS},
                timeout=120,
            )
            if r.status_code == 200:
                break
            wait = 2**attempt
            print(f"  batch {i // BATCH}: HTTP {r.status_code}, retry in {wait}s")
            time.sleep(wait)
        else:
            sys.exit(f"embedding batch {i // BATCH} failed: {r.text[:300]}")
        data = r.json()["data"]
        out.extend(d["embedding"] for d in sorted(data, key=lambda d: d["index"]))
        print(f"  embedded {min(i + BATCH, len(words)):,}/{len(words):,}")
    vecs = np.asarray(out, dtype=np.float32)
    np.save(CACHE, vecs)
    return vecs


def main():
    spec = json.loads(WORDS.read_text())
    words = spec["human"] + spec["creature"]
    kinds = [1] * len(spec["human"]) + [0] * len(spec["creature"])
    human_idx = spec["human"].index("human")

    t0 = time.time()
    vecs = embed(words, api_key())
    t1 = time.time()

    import umap

    pos = umap.UMAP(
        n_components=3,
        n_neighbors=15,
        min_dist=0.08,
        metric="cosine",
        random_state=SEED,
    ).fit_transform(vecs)
    t2 = time.time()

    pos = pos - pos.mean(axis=0)
    pos = pos / np.percentile(np.linalg.norm(pos, axis=1), 90)

    records = [
        {"w": w, "k": k, "p": [round(float(v), 3) for v in p]}
        for w, k, p in zip(words, kinds, pos)
    ]
    POINTS_JSON.write_text(json.dumps(records))

    meta = {
        "model": MODEL,
        "dims": DIMS,
        "umap": {"n_neighbors": 15, "min_dist": 0.08, "metric": "cosine", "seed": SEED},
        "n_human": len(spec["human"]),
        "n_creature": len(spec["creature"]),
    }
    payload = {
        "meta": meta,
        "humanIndex": human_idx,  # the single labeled point: "human"
        "kind": kinds,
        "pos": [round(float(v), 3) for v in pos.ravel()],
    }
    POINTS_JS.parent.mkdir(parents=True, exist_ok=True)
    POINTS_JS.write_text("window.EMBED_SPACE = " + json.dumps(payload) + ";\n")

    print(f"embed {t1 - t0:5.1f}s   umap {t2 - t1:5.1f}s   points {len(words):,}")
    print(f"wrote {POINTS_JS.relative_to(REPO)} ({POINTS_JS.stat().st_size / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Precompute the projector's data artifacts from the embedding-space study.

Reuses the cached 256-d vectors (embedding-space/data/embeddings.npy) and the
UMAP 3D positions (embedding-space/data/points.json) — the 5,000-word cloud
costs nothing to rebuild. The only API spend is ~40 anchor words for the two
semantic axes, cached in data/anchor-cache.json so re-runs are free.

  beloved -> reviled   axis   (the Boids axis: collective affection)
  gregarious -> solitary axis (group-living score, for the flocking filter)

Writes web/data/{meta.json, positions.bin, vectors.bin, scores.bin}.
"""

import json
import sys
import time
from pathlib import Path

import numpy as np
import requests

MODEL = "text-embedding-3-small"
DIMS = 256
PRICE_PER_MTOK = 0.02  # USD, text-embedding-3-small

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
STUDY = REPO / "embedding-space" / "data"
ANCHOR_CACHE = ROOT / "data" / "anchor-cache.json"
OUT = ROOT / "web" / "data"

# Axis anchors. Single common words; the axis is the difference of the two
# centroids, so individual word quirks wash out.
LOVE_POS = """beloved adored cherished treasured darling lovable endearing
              adorable precious delightful charming dear""".split()
LOVE_NEG = """reviled despised loathed hated detested abhorred disgusting
              repulsive vile loathsome odious dreadful""".split()
GROUP_POS = """flock swarm herd school colony gregarious communal collective
               crowd congregation troop multitude""".split()
GROUP_NEG = """solitary lone hermit recluse loner secluded isolated
               withdrawn""".split()


def api_key():
    env = REPO / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line.startswith("OPENAI_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("no OPENAI_API_KEY in repo .env")


def embed_anchors(words):
    cache = {}
    if ANCHOR_CACHE.exists():
        blob = json.loads(ANCHOR_CACHE.read_text())
        if blob.get("model") == MODEL and blob.get("dims") == DIMS:
            cache = blob["vectors"]
    missing = [w for w in words if w not in cache]
    if missing:
        est_tokens = sum(len(w) // 4 + 1 for w in missing)
        print(
            f"embedding {len(missing)} anchor words "
            f"~{est_tokens} tokens ~${est_tokens / 1e6 * PRICE_PER_MTOK:.7f}"
        )
        r = requests.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {api_key()}"},
            json={"model": MODEL, "input": missing, "dimensions": DIMS},
            timeout=120,
        )
        r.raise_for_status()
        data = r.json()
        for w, d in zip(missing, sorted(data["data"], key=lambda d: d["index"])):
            cache[w] = d["embedding"]
        ANCHOR_CACHE.parent.mkdir(parents=True, exist_ok=True)
        ANCHOR_CACHE.write_text(
            json.dumps({"model": MODEL, "dims": DIMS, "vectors": cache})
        )
        print(f"  actual usage: {data['usage']['total_tokens']} tokens")
    else:
        print("anchor embeddings: all cached, no API call")
    return {w: np.asarray(cache[w], dtype=np.float32) for w in words}


def unit(v, axis=-1):
    return v / np.linalg.norm(v, axis=axis, keepdims=True)


def axis_from(anchors, pos, neg):
    p = unit(np.stack([anchors[w] for w in pos])).mean(axis=0)
    n = unit(np.stack([anchors[w] for w in neg])).mean(axis=0)
    return unit(p - n)


def main():
    spec = json.loads((STUDY / "words.json").read_text())
    words = spec["human"] + spec["creature"]
    kind = [1] * len(spec["human"]) + [0] * len(spec["creature"])

    vecs = unit(np.load(STUDY / "embeddings.npy").astype(np.float32))
    points = json.loads((STUDY / "points.json").read_text())
    assert vecs.shape == (len(words), DIMS), "vector cache out of sync"
    assert [r["w"] for r in points] == words, "points.json out of sync"
    pos3 = np.asarray([r["p"] for r in points], dtype=np.float32)

    anchors = embed_anchors(sorted(set(LOVE_POS + LOVE_NEG + GROUP_POS + GROUP_NEG)))
    axis_love = axis_from(anchors, LOVE_POS, LOVE_NEG)
    axis_group = axis_from(anchors, GROUP_POS, GROUP_NEG)

    s_love = vecs @ axis_love  # higher = more beloved
    s_group = vecs @ axis_group  # higher = more group-living

    creature = np.asarray(kind) == 0
    ci = np.flatnonzero(creature)

    # equal-count quintiles over creatures, bin 0 = most beloved
    order = ci[np.argsort(-s_love[ci])]
    quintile = np.full(len(words), -1, dtype=np.int8)
    for rank, i in enumerate(order):
        quintile[i] = rank * 5 // len(order)

    group_thr = float(np.quantile(s_group[ci], 0.70))
    group = np.where(creature & (s_group >= group_thr), 1, 0).astype(np.int8)

    # 3D axis: regress UMAP position on the beloved score (creatures only)
    sc, pc = s_love[ci], pos3[ci]
    s_mean = float(sc.mean())
    p_mean = pc.mean(axis=0)
    slope = ((sc - s_mean)[:, None] * (pc - p_mean)).sum(axis=0) / ((sc - s_mean) ** 2).sum()
    u = slope / np.linalg.norm(slope)
    s_ends = [float(np.quantile(sc, 0.98)), float(np.quantile(sc, 0.02))]

    # quintile gates: ring at the bin's median score, radius = the bin's
    # 60th-percentile perpendicular spread around the fitted line
    gates, labels = [], []
    for b in range(5):
        bi = ci[quintile[ci] == b]
        sb = s_love[bi]
        s_med = float(np.median(sb))
        rel = pos3[bi] - p_mean
        perp = rel - np.outer(rel @ u, u)
        radius = float(np.quantile(np.linalg.norm(perp, axis=1), 0.50))
        gates.append(
            {
                "s": round(s_med, 4),
                "sMin": round(float(sb.min()), 4),
                "sMax": round(float(sb.max()), 4),
                "radius": round(radius, 4),
                "count": int(len(bi)),
            }
        )
        # curated labels: group-living creatures nearest the bin's median score
        cand = [i for i in bi if group[i]] or list(bi)
        cand.sort(key=lambda i: abs(s_love[i] - s_med))
        labels.extend(int(i) for i in cand[:4])

    OUT.mkdir(parents=True, exist_ok=True)
    pos3.astype("<f4").tofile(OUT / "positions.bin")
    vecs.astype("<f4").tofile(OUT / "vectors.bin")
    np.stack([s_love, s_group], axis=1).astype("<f4").tofile(OUT / "scores.bin")

    meta = {
        "model": MODEL,
        "dims": DIMS,
        "generated": time.strftime("%Y-%m-%d"),
        "nHuman": len(spec["human"]),
        "nCreature": len(spec["creature"]),
        "words": words,
        "kind": kind,
        "quintile": quintile.tolist(),
        "group": group.tolist(),
        "labels": labels,
        "groupThreshold": round(group_thr, 4),
        "axis": {
            "pMean": [round(float(v), 4) for v in p_mean],
            "slope": [round(float(v), 4) for v in slope],
            "sMean": round(s_mean, 4),
            "sEnds": [round(v, 4) for v in s_ends],
            "gates": gates,
        },
        "anchors": {
            "lovePos": LOVE_POS,
            "loveNeg": LOVE_NEG,
            "groupPos": GROUP_POS,
            "groupNeg": GROUP_NEG,
        },
    }
    (OUT / "meta.json").write_text(json.dumps(meta))

    span = s_love[ci].max() - s_love[ci].min()
    print(f"creatures {len(ci):,}   beloved-score span {span:.3f}   group-living {int(group.sum()):,}")
    print("gates:", " | ".join(f"{g['s']:+.3f} r{g['radius']:.2f}" for g in gates))
    print("labels:", ", ".join(words[i] for i in labels))
    print(f"wrote {OUT.relative_to(REPO)}  (meta.json + 3 binary buffers)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

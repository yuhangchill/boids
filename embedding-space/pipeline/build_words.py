#!/usr/bin/env python3
"""Build the vocabulary for the semantic-space study.

Two populations, drawn from WordNet noun hyponym closures:
  human    — appellations of people in society   (person.n.01)
  creature — names of living creatures            (animal.n.01)

Writes data/words.json. Deterministic (fixed seed). The only network cost is
the one-time WordNet corpus download (~10 MB) on first run.
"""

import json
import random
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", message="Discarded redundant search")

TARGET_HUMAN = 2000
TARGET_CREATURE = 3000
SEED = 42

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "words.json"


def load_wordnet():
    import nltk

    try:
        from nltk.corpus import wordnet as wn

        wn.synsets("human")
    except LookupError:
        nltk.download("wordnet", quiet=True)
        from nltk.corpus import wordnet as wn
    return wn


def lemmas_under(wn, synset_name, max_parts=1):
    """Lowercase common-noun lemmas in the hyponym closure of a synset.

    Appellations stay single words; creature names may be two-part
    ("sea otter", "polar bear") since that is how English names them.
    Capitalized lemmas (proper nouns, breeds) are excluded either way.
    """
    root = wn.synset(synset_name)
    words = set()
    for syn in [root, *root.closure(lambda s: s.hyponyms())]:
        for lemma in syn.lemmas():
            parts = lemma.name().split("_")
            if len(parts) > max_parts or not (3 <= len(lemma.name()) <= 24):
                continue
            if all(p.isalpha() and p.islower() and len(p) >= 2 for p in parts):
                words.add(" ".join(parts))
    return words


def main():
    wn = load_wordnet()
    rng = random.Random(SEED)

    human_pool = lemmas_under(wn, "person.n.01", max_parts=1)
    creature_pool = lemmas_under(wn, "animal.n.01", max_parts=2)

    # words in both closures (queen, drone, mule...) count as human appellations;
    # "human" itself is forced into the human set — it is the one labeled point
    creature_pool -= human_pool
    human_pool.add("human")
    creature_pool.discard("human")

    human = sorted(human_pool)
    creature = sorted(creature_pool)
    if len(human) > TARGET_HUMAN:
        keep = set(rng.sample(human, TARGET_HUMAN - 1))
        keep.add("human")
        human = sorted(keep)
    if len(creature) > TARGET_CREATURE:
        creature = sorted(rng.sample(creature, TARGET_CREATURE))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"human": human, "creature": creature}, indent=1))

    total = len(human) + len(creature)
    est_tokens = sum(len(w) // 4 + 1 for w in human + creature)
    print(f"pool sizes        human {len(human_pool):>6,}   creature {len(creature_pool):>6,}")
    print(f"sampled           human {len(human):>6,}   creature {len(creature):>6,}   total {total:,}")
    print(f"embedding input   ~{est_tokens:,} tokens")
    print(f"wrote {OUT.relative_to(ROOT.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

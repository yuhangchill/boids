# Embedding figure — draft text for the paper

Source material for the manuscript: an in-text introduction to embeddings written
around the figure, and the figure caption. The figure is exported from
`embedding-space/web/` (see `embedding-space/README.md` for the pipeline); every
quantitative claim below was computed in the original 256-dimensional space from
this run's cached vectors, not from the projection.

---

## In-text introduction

A text embedding model maps a word to a point in a high-dimensional vector space.
The mapping is learned from very large corpora under a single pressure: words that
occur in similar contexts must receive nearby vectors. Proximity in the space —
measured as cosine similarity — therefore approximates semantic relatedness, not by
definition but by accumulated usage. The geometry of an embedding space is, in this
sense, a sediment of collective linguistic behaviour: it records how a language
community has actually spoken about each thing, averaged over everything it has
written. This is the property the present work relies on when it treats the space
as a proxy for collective human perception.

The figure makes this geometry visible for one deliberately chosen slice of the
lexicon. A vocabulary of 5,000 English words was drawn from WordNet's noun
hierarchy: 2,000 appellations of persons in society (the hyponym closure of
*person* — kin terms, trades, offices, insults, honorifics) and 3,000 names of
creatures (the closure of *animal*). Each word was embedded independently with a
production embedding model (`text-embedding-3-small`) at 256 dimensions, and the
resulting point set was projected to three dimensions with UMAP for display. Every
point in the figure is one word; appellations are drawn in amber, creatures in
translucent white, and overlapping points add luminance, so brightness encodes
local density. No word is labelled except one, *human*.

Two properties of embedding spaces are legible in the figure. The first is that
category structure emerges without supervision. The model was never told that the
vocabulary contains two kinds of words, yet the amber and white populations occupy
largely disjoint territories: in the original 256-dimensional space, 86.1% of each
word's ten nearest neighbours share its category. The second is that this structure
is fine-grained well below the category level. The nearest neighbours of
*carpenter* are *woodcarver*, *carver*, *woodworker*, *cabinetmaker*, *crafter*;
the nearest neighbours of *sparrow* are *field sparrow*, *tree sparrow*, *song
sparrow*, *hedge sparrow*, *vesper sparrow*. Semantic neighbourhoods in the space
are as specific as a trade or a genus. At the same time the two territories are not
distant islands: a silhouette coefficient of 0.065 across the two categories shows
one continuous fabric with an internal border, adjacent regions rather than
separated clusters — the lexicon does not partition, it differentiates.

The single labelled point marks where that border runs. *Human* is the one word in
the vocabulary that belongs to both readings at once — a species among species, and
the category from which every appellation descends. Its neighbourhood in the
original space mixes the two populations: species-sense terms from the creature
vocabulary (*human being*, *human race*) interleave with person-sense terms from
the appellations (*mensch*, *humanist*). In the projection it sits accordingly at
the interface between the amber and the white cloud. The figure leaves every other
point unlabelled on purpose: what it asks to be read is not any word but the shape
of the space — that usage alone has sorted society from nature, and where the
sorting hesitates.

One methodological caution applies to any such image. UMAP preserves local
neighbourhood structure at the cost of global metric fidelity; the projection
supports qualitative reading — clusters, adjacency, the position of *human* — but
distances measured on the image are not distances in the embedding space. All
numbers quoted above are computed on the original vectors.

---

## Figure caption

**Figure 1. Human appellations and creature names in the embedding space of a
language model.** Each point is one of 5,000 English words: 2,000 appellations of
persons in society (amber) and 3,000 creature names (translucent white), drawn from
WordNet, embedded independently with `text-embedding-3-small` (256 dimensions), and
projected to three dimensions with UMAP (cosine metric, *n*<sub>neighbors</sub> = 15,
min_dist = 0.08, fixed seed). Overlapping points add luminance, so brightness
encodes local density. The model received no category information; the separation
of the two vocabularies emerges from usage statistics alone (in the original space,
86.1% of each word's ten nearest neighbours share its category). The single
labelled point, *human*, lies at the interface of the two populations, and its
nearest neighbours mix species terms (*human being*, *human race*) with social
terms (*mensch*, *humanist*). All other points are deliberately unlabelled.

Short variant, if the venue prefers one sentence:

**Figure 1.** 5,000 English words — 2,000 human appellations (amber) and 3,000
creature names (white) — embedded with `text-embedding-3-small` (256 d) and
projected by UMAP; categories separate without supervision, and the one labelled
word, *human*, sits where the two populations meet.

---

## Reproducibility note

- Vocabulary: WordNet 3.0 hyponym closures of `person.n.01` (single-word lemmas,
  sampled to 2,000) and `animal.n.01` (one- and two-word lemmas, sampled to 3,000),
  lowercase common nouns only, seed 42. Words occurring in both closures were
  assigned to the appellation class; note the animal closure contains *Homo*, so
  species-sense synonyms of *human* (*human being*, *human race*) belong to the
  creature vocabulary — relevant when reading the labelled point's neighbourhood.
- Embedding: OpenAI `text-embedding-3-small`, `dimensions=256` (vectors
  L2-normalised by the API), one vector per word, no templates or context.
- Projection: `umap-learn` 0.5.12, `n_components=3`, `n_neighbors=15`,
  `min_dist=0.08`, `metric="cosine"`, `random_state=42`.
- Statistics (256-d space, cosine): 10-NN class purity 0.861; two-class silhouette
  coefficient 0.065.
- Pipeline and viewer: `embedding-space/` (deterministic; raw vectors cached).

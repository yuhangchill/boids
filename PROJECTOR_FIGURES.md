# Axis figure — draft text for the paper

Source material for the manuscript: in-text descriptions and captions for a
three-panel figure exported from the interactive viewer in `projector/` (see
`projector/README.md` for the pipeline). The three panels are the files
`a.png`, `b.png`, `c.png` in the repository root; they show the same view of
the same point set with annotation layers added cumulatively, and each panel
corresponds exactly to one switch state of the viewer. As with Figure 1, every
quantitative claim below was computed in the original 256-dimensional space
from this run's cached vectors, not from the projection. Panel numbering
(Figure 2 here) should be renumbered to fit the manuscript.

---

## In-text introduction

Figure 1 read the embedding space as a record of *what* the lexicon
distinguishes. The present figure asks whether the space also records *how the
language community feels* about what it distinguishes — whether affection is
legible as a direction. The method is the classical semantic-differential
construction: two small sets of anchor words naming the poles of an attitude
(twelve of endearment — *beloved*, *adored*, *cherished*… — and twelve of
revulsion — *reviled*, *despised*, *loathed*…) are embedded in the same space,
and the unit difference of their centroids defines an axis. Projecting a
word's vector onto this axis yields a scalar affection score; no model was
trained, no word was rated by hand, and the score inherits its meaning
entirely from usage — it measures how closely a creature's contexts of
mention resemble the contexts of endearment rather than of revulsion. The
figure builds this reading in three steps.

### Panel a — the unannotated field (`a.png`)

![Panel a](a.png)

> **(a)** The point field with annotation withheld: 3,000 creature names in
> uniform luminance, twenty of them labelled; the basis of the selection is
> the subject of panel c.

The first panel shows the material before any measurement is drawn on it. The
same 5,000-word vocabulary, 256-dimensional embedding, and three-dimensional
UMAP projection as Figure 1 are rendered as a point field of uniform colour
and luminance; overlapping points add brightness, so density remains the only
visible structure, and the remainder of the vocabulary recedes into an
unannotated background field. Twenty creature names are labelled — *capuchin*,
*stork*, *chevrotain*, *cockroach*, among others — and nothing in this panel
explains their selection. The panel establishes the ground truth of the
figure: an undifferentiated cloud in which the labelled words are, so far,
arbitrary.

### Panel b — the affection axis (`b.png`)

![Panel b](b.png)

> **(b)** The affection axis added: creatures are scored against the
> beloved→reviled direction in the original space, divided into equal-count
> quintiles carrying a warm→cold gradient, and the axis is drawn as a
> least-squares fit through the projection.

The second panel draws the measurement. Each of the 3,000 creature vectors is
scored against the beloved→reviled axis; scores span 0.60 in cosine terms
(from +0.34 for the most beloved creature to −0.26 for the most reviled). The
creatures are divided into five equal-count quintiles of 600, and each
quintile carries one step of a warm→cold gradient — gold for the most
beloved fifth, through coral, magenta, and violet, to cold blue for the most
reviled. The axis itself is drawn as a line through the projected cloud,
fitted by least squares of projected position against score and clipped to
the 2nd–98th percentile of scores, its ends marked BELOVED and REVILED. Two
things become visible at once: the gradient is not random — warm and cold
points occupy recognisably different territories — and the drawn line cuts
*obliquely* through the cloud rather than along any of its principal
extents. The obliqueness is informative. UMAP organises the projection
primarily by taxonomy (Figure 1); affection is a direction the space carries
in addition to taxonomy, not instead of it.

### Panel c — the funnel (`c.png`)

![Panel c](c.png)

> **(c)** All layers: five gates ring the axis at each quintile's median
> score, the gregarious top 30% of creatures retain full luminance while the
> rest recede, and the twenty labels are now legible as the survivors of the
> full selection — four group-living creatures at each gate, from
> *flickertail* and *capuchin* at the beloved end to *mole rat* and
> *cockroach* at the reviled end.

The final panel completes the construction and, with it, the explanation the
first panel withheld. Five rings — gates I–V — are drawn perpendicular to the
fitted axis at each quintile's median score (+0.171, +0.104, +0.058, +0.005,
−0.076), each with the radius of its quintile's median perpendicular spread,
so the rings state where along the axis each fifth of the creatures sits and
how loosely it scatters. A second axis, built from the same construction with
gregarious-versus-solitary anchors (*flock*, *swarm*, *herd*… against
*solitary*, *hermit*, *recluse*…), marks the top 30% of creatures — 900 words
— as group-living; the switch recedes all others, leaving the sociable
remainder glowing in its quintile colours. The twenty labels of panel a are
now legible as the intersection of both measurements: at each gate, the four
group-living creatures whose scores lie nearest that quintile's median — from
*flickertail*, *capuchin*, *greater kudu*, and *lion marmoset* at gate I to
*mole rat*, *louvar*, *cephalaspid*, and *cockroach* at gate V. The figure
thus performs, in three steps, the selection procedure of the work itself:
from an undifferentiated lexicon, through a collectively-authored axis of
affection, to five small cohorts of social creatures stationed from beloved
to reviled.

---

## Figure caption

**Figure 2. A collective-affection axis over 3,000 creature names, read from
the embedding space.** The creature vocabulary of Figure 1, in the same
256-dimensional embedding and UMAP projection, annotated cumulatively.
**(a)** The unannotated field: points of uniform luminance; twenty creature
names are labelled, their selection explained by panel c. **(b)** An
affection axis is constructed in the original space as the unit difference
between the centroids of twelve endearment anchors (*beloved*, *adored*, …)
and twelve revulsion anchors (*reviled*, *despised*, …); creatures are scored
by projection onto it (span 0.60, cosine), divided into equal-count quintiles
of 600, and coloured on a warm→cold gradient from most beloved (gold) to most
reviled (blue). The drawn line is a least-squares fit of projected position
against score; it cuts obliquely through a cloud that UMAP organises
primarily by taxonomy — affection is carried in addition to taxonomy, not
instead of it. **(c)** Gates I–V ring the fitted axis at each quintile's
median score (+0.171 to −0.076) with the quintile's median perpendicular
spread as radius; a second, gregarious↔solitary axis marks the top 30% of
creatures (900) as group-living, and all others recede. The labels are the
survivors of both measurements — at each gate, the four group-living
creatures nearest its median — from *flickertail* and *capuchin* (gate I) to
*mole rat* and *cockroach* (gate V). All scores were computed on the original
vectors; the projection is used for display only.

Short variant, if the venue prefers one sentence per panel:

**Figure 2.** The 3,000 creature names of Figure 1 under cumulative
annotation: (a) the unannotated point field with twenty as-yet-unexplained
labels; (b) an affection axis built from endearment-versus-revulsion anchor
words in the original 256-d space, creatures coloured by score quintile from
beloved (gold) to reviled (blue), the axis drawn as a least-squares fit
through the projection; (c) quintile gates I–V ringing the axis, the
gregarious top 30% of creatures isolated, and the labels resolved as the four
group-living creatures nearest each gate — the work's five cohorts, stationed
from beloved to reviled.

---

## Reproducibility note

- Vocabulary, embedding, and projection: identical to Figure 1
  (`embedding-space/`; WordNet closures, `text-embedding-3-small` at 256
  dimensions, UMAP with cosine metric, *n*<sub>neighbors</sub> = 15,
  min_dist = 0.08, fixed seed). Human appellations remain in the field as
  background but carry no annotation in this figure.
- Affection axis: û = unit(mean(E⁺) − mean(E⁻)) over unit-normalised anchor
  embeddings. E⁺ = {beloved, adored, cherished, treasured, darling, lovable,
  endearing, adorable, precious, delightful, charming, dear}; E⁻ = {reviled,
  despised, loathed, hated, detested, abhorred, disgusting, repulsive, vile,
  loathsome, odious, dreadful}. Score s = v·û; creature range −0.257 to
  +0.339.
- Quintiles: equal-count bins of 600 by descending score. Gate rings sit at
  each bin's median score (+0.1705, +0.1042, +0.0575, +0.0049, −0.0759),
  perpendicular to the fitted line, with radius equal to the bin's median
  perpendicular distance from the line.
- Drawn axis: least-squares regression of projected 3-D position on score,
  clipped to the 2nd–98th score percentiles. A fit for display; not an axis
  of the projection.
- Group-living: same construction with E⁺ = {flock, swarm, herd, school,
  colony, gregarious, communal, collective, crowd, congregation, troop,
  multitude}, E⁻ = {solitary, lone, hermit, recluse, loner, secluded,
  isolated, withdrawn}; threshold at the 70th percentile of creature scores
  (s ≥ 0.0541), marking 900 creatures.
- Labels: per quintile, the four group-living creatures with scores nearest
  the bin median.
- Panels exported from the interactive viewer (`projector/`, layer switches:
  a = labels only; b = + quintile colours, axis; c = all layers including
  gates and the group-living filter).

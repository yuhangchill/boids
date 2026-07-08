# Axis figure — panel descriptions (Fable draft)

Reference prose for the three-panel figure exported from the interactive viewer
in `projector/`. Panels are `axis_a.png`, `axis_b.png`, `axis_c.png` in the
repository root: one camera view of one point set, with the viewer's annotation
layers switched on cumulatively (a — curated labels only; b — quintile colours
and the fitted axis added; c — all layers, including gates I–V and the
group-living filter).
Written independently of `PROJECTOR_FIGURES.md`; the two drafts describe the
same panels and either may be quarried. All quantities below were computed on
the original 256-dimensional vectors of this run; the projection is display
only.

Panel names, if the figure files want titles: **a — Ground · b — Direction ·
c — Gates.**

**Homepage strip:** the three panels are also to be composited, in narrative
order a → b → c left to right, into a single full-width triptych for the
repository homepage hero. The panels share one camera view, so the joined
strip reads as one continuous scene annotated in three acts (ground →
direction → gates); keep the seams butt-joined (no gutter, no frames) and crop
all three to the same height. The whole-figure caption below doubles as the
strip's alt text.

---

## Panel a — Ground (`a.png`)

![Panel a — Ground](axis_a.png)

> **(a)** Ground. 3,000 creature names embedded at 256 dimensions and laid out
> in three dimensions by UMAP; luminance accumulates where points overlap, so
> brightness reads as local density. Twenty names are printed beside their
> points; the panel gives no grounds for their selection.

The opening panel withholds every measurement and shows only the material. Each
point is one creature name; its position is the UMAP image of the word's
256-dimensional embedding vector, so proximity on the page approximates
proximity of usage. All points share one hue and one nominal size, and the
rendering is additive — where the vocabulary crowds, the field brightens — so
the only structure the panel can express is topographic: the cloud gathers into
lobes and filaments that correspond, on inspection, to taxonomic neighbourhoods
(waterbirds with waterbirds, ungulates with ungulates), with the rest of the
corpus receding into a faint unannotated background. Against this
undifferentiated ground, exactly twenty names are typeset in situ —
*flickertail*, *keeshond*, *stork*, *chevrotain*, *cockroach*, among others.
They are distributed across the full extent of the cloud rather than gathered
in any one lobe, which is the panel's single foreshadowing gesture: whatever
selected them was not taxonomy. The criterion is withheld until panel c.

## Panel b — Direction (`b.png`)

![Panel b — Direction](axis_b.png)

> **(b)** Direction. Every creature is scored in the original space against a
> beloved→reviled axis (the unit difference of twelve endearment and twelve
> revulsion anchor centroids; scores −0.257 to +0.339). Equal-count quintiles
> of 600 take a five-step warm→cold ramp, and the axis enters the scene as a
> least-squares line through the projection, lettered BELOVED and REVILED.

The second panel introduces one scalar and lets it recolour the scene. In the
original 256-dimensional space, an affection axis û is constructed with the
semantic-differential recipe — twelve anchors of endearment (*beloved*,
*adored*, *cherished*, …) against twelve of revulsion (*reviled*, *despised*,
*loathed*, …), each set averaged, the difference normalised — and every
creature receives the score s = v·û, ranging from +0.339 to −0.257. The 3,000
creatures are then cut into five equal-count quintiles of 600 and each quintile
takes one step of a warm→cold ramp: gold for the most-beloved fifth, then
coral, magenta, violet, and a cold blue for the most-reviled. The axis itself
is drawn into the projection as the least-squares line of 3-D position against
score, clipped to the 2nd–98th score percentiles and carrying the same ramp
along its length, its ends lettered BELOVED and REVILED. Two readings arise
together. First, the colouring is far from random: warm and cold tones pool in
different provinces of the cloud, so the affection score is geometrically
coherent even in a layout it played no part in computing. Second, the drawn
line crosses the cloud obliquely — it aligns with none of the cloud's principal
extents, because UMAP has organised the projection chiefly by taxonomy.
Affection, the panel says, is a real direction of the space, but one that runs
athwart its dominant order.

## Panel c — Gates (`c.png`)

![Panel c — Gates](axis_c.png)

> **(c)** Gates. Rings I–V stand perpendicular to the fitted axis at each
> quintile's median score (+0.171, +0.104, +0.058, +0.005, −0.076), radius
> equal to the quintile's median perpendicular scatter; a second,
> gregarious↔solitary axis keeps the top 30% of creatures (900, s ≥ 0.054) at
> full luminance while the rest recede. The twenty labels resolve: at each
> gate, the four group-living creatures nearest its median — *flickertail*,
> *capuchin*, *greater kudu*, *lion marmoset* at gate I; *mole rat*, *louvar*,
> *cephalaspid*, *cockroach* at gate V.

The closing panel turns the direction into a selection instrument, and in doing
so pays the debt of panel a. Five rings — gates I to V — are erected
perpendicular to the fitted axis, one at each quintile's median score, each
with the radius of its quintile's median perpendicular scatter (0.42–0.48 in
projection units). Because the quintiles' scatter is broad relative to their
spacing along the axis, the rings visibly interpenetrate: each fifth of the
creatures has a well-defined station on the axis and, at the same time, a wide
territory around it — the gates state both facts at once. A second axis, built
by the identical construction from gregarious anchors (*flock*, *swarm*,
*herd*, …) against solitary ones (*solitary*, *hermit*, *recluse*, …), imposes
the social criterion: the top 30% of creatures by grouping score — 900 words,
s ≥ 0.054 — hold their full quintile colour while the remainder dims toward
the background. What survives both cuts is exactly the labelled twenty of
panel a: at every gate, the four group-living creatures whose affection scores
sit nearest that quintile's median, running from *flickertail*, *capuchin*,
*greater kudu*, and *lion marmoset* at the beloved gate to *mole rat*,
*louvar*, *cephalaspid*, and *cockroach* at the reviled one. Read in sequence,
the three panels perform the work's own procedure: a lexicon, a
collectively-authored direction through it, and five small societies of
creatures admitted at stations from beloved to reviled.

---

## Whole-figure caption

**Figure 2. From point field to five cohorts: reading collective affection out
of the embedding space.** One view of the 3,000 creature names of Figure 1
(same 256-d embedding, same UMAP projection), annotated cumulatively. **(a)**
The unmeasured ground: points of one hue, brightness encoding density, twenty
names labelled without stated cause. **(b)** An affection axis û — the unit
difference between the centroids of twelve endearment and twelve revulsion
anchor words, built in the original space — scores every creature (−0.257 to
+0.339); equal-count quintiles of 600 take a warm→cold ramp, and the axis is
drawn as the least-squares line of projected position against score, oblique
to a layout that UMAP organises by taxonomy. **(c)** Gates I–V ring the axis
at the quintile medians (+0.171 to −0.076) with each quintile's median scatter
as radius; a gregarious↔solitary axis of the same construction keeps the 900
most group-living creatures lit; the twenty labels resolve as the four
group-living creatures nearest each gate. Scores computed on original vectors;
the projection is used for display only.

One-sentence variant:

**Figure 2.** The creature vocabulary under cumulative annotation — (a) the
unmeasured point field with twenty unexplained labels, (b) a beloved→reviled
axis built from anchor words in the original 256-d space and drawn obliquely
through the taxonomic layout with its five score-quintiles coloured warm to
cold, (c) quintile gates I–V and a gregariousness filter under which the
labels resolve into five four-member cohorts of social creatures, stationed
from beloved to reviled.

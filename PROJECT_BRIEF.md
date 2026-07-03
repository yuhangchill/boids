# Boids - Project Brief & Decisions Record

> Authoritative source of intent for this project. Read this in full before writing or
> changing code. Code cannot reconstruct the reasoning below; keep this file and
> DECISIONS.md current as the single source of truth for *why*, not just *what*.
> Target build agent: Fable Claude Code. Target venue: VISAP (paper + artwork).
> Name: "Boids", spelled WITH the trailing s.

---

## 0. One line

An installation that treats a language model's embedding space as a proxy for collective
human perception, and makes cultural bias toward other animals *legible* rather than merely
illustrated. Groups of creatures, ranked from beloved to reviled, flock with identical logic
and identical grace; the viewer's own emotional response is the exhibit.

---

## 1. Origin (before the name "Boids")

The project did not start as an artwork. Its earliest motivation was a high-dimensional
vector space problem: how to extract and carry abstract, multidimensional semantic structure.
The early decision was to carry that structure with an organic, non-linear, emergent system
rather than a rigid data visualization. Flocking was the organic carrier that got selected.
Earliest keywords: high-dimensional vector spaces, biological simulations, emergent systems.

The name Boids is plural on purpose: the watched animal groups are flocks (boids), and the
watching human audience is itself a flock (a boid). Both the seen and the seeing are boids.
This duality is the conceptual pivot.

---

## 2. Core concept

- The embedding space stands in for collective human perception.
- The work does not illustrate bias; it makes bias legible. Viewers see beloved and reviled
  creatures behaving under the same algorithm with the same grace, and are confronted with why
  their feelings diverge for beings that are, algorithmically, the same.
- Thematically, the fondness-to-revulsion hierarchy we impose on animals echoes broader
  patterns of othering. This stays a resonance, not a mechanic.

---

## 3. Method - the beloved-to-reviled axis (curation-time)

The piece ranks animals along a single semantic direction: from beloved to reviled
(喜爱 to 厌恶), that is, how a creature sits in collective human feeling.

- **Not anchored on "human".** "human" was only a stray answer to "what seed word," not the
  origin of the axis. Drop it.
- **Defined by two endpoints, not a basket of emotion words.** Default axis:
  V_axis = E("beloved") - E("reviled"). Endpoint words are a genuine choice; alternatives are
  adored / loathed, or the noun forms love / disgust. "reviled / loathed" carry the disgust /
  revulsion sense of 厌恶 better than a generic "dislike." Endpoints live in config and swap in
  one line. Do NOT expand this into an engineered list of positive / negative words.
- **Score** each animal by its projection onto V_axis (dot product with the unit axis; cosine
  is a fine proxy for ranking).
- **Group into five bands, not fixed cut points.** Sort by score and define five rough score
  intervals from most beloved to most reviled. Band positions and widths are a design choice,
  human-editable. The middle liminal band (neither beloved nor reviled) is the most delicate
  and gets deliberate attention. Band width / density also feeds gradient richness (section 6).

Similarity note: embeddings come from the API only (no local model). The projection itself is
a trivial arithmetic step on the returned vectors (a dot product and a division). There is no
separate "similarity" API endpoint and no need for one.

### 3a. Creature set

- **A broad, natural list of common animals, fully open.** No exclusion filters, no forced
  category diversity, no recognizability weighting. Mollusks and parasites are explicitly
  included: squid and other mollusks are common and their motion is interesting for flocking,
  and parasites may form the most-reviled tier rather than being irrelevant. Let the axis
  organize whatever is in the list; keep the human thumb off the scale.
- **Size 200-500** as a density-vs-reviewability tradeoff, not a hard number.
- Non-binding render caveat (on-site, not a selection rule): the upper layer is species-
  identifiable, so extremely formless creatures may be hard to depict.

---

## 4. Cultural lens control (and a paper dimension)

Two layers must not be confused:
- Language of instructions to the coding agent (Chinese is fine).
- Language of strings actually embedded (endpoint words, creature names, color names, trait words).

Only the second enters the semantic computation and carries cultural bias. All embedded
strings are English, which guarantees the intended English / Western lens and maximizes
legibility for the venue. Chinese authoring of prompts has zero effect on output as long as
this holds.

The language of the embedded vocabulary is itself a controllable cultural lever: running the
identical pipeline with a Chinese vocabulary yields a different ranking, and the divergence is
itself a finding. Keep the pipeline language-parameterized so a zh/en comparison is trivial
later. Out of scope for the primary build; a candidate paper section.

---

## 5. Physical realization (current design)

Each display unit is a dual-layer stacked LCD driving a "naked vs. packaged" reveal:

- **Lower layer: black dots on a pure white background** (the raw algorithmic form). Always
  visible. Note precisely: pure white ground, black points; not a generic "black and white."
- **Upper layer: detailed, color, species-identifiable** visuals. Its polarizing film is
  removed from the panel; a separate polarizer is mounted at a distance in front of the stack.
- The upper layer only resolves through the floating polarizer, so a viewer moving position
  chooses whether they see the naked particle truth or the packaged recognizable species. This
  is the whole interaction: optical and parallax-based, no camera, no tracking. Flocking is
  autonomous.

Eventual full installation: five groups, so five dual-layer display units = five windows,
each drawing its own two layers = ten images total. The optics (polarizer removal, mounting
distance, registration jig) are the artist's physical domain. Software boundary: output normal,
spatially registered images.

---

## 6. Software architecture (locked decisions)

- **Embeddings via API only.** Default OpenAI text-embedding-3-large. No local embedding model.
  Behind a swappable EmbeddingProvider interface. Embedding is curation-time only; show /
  runtime is fully offline.
- **One simulation, layers drawn together.** A single deterministic 2D flocking simulation
  drives both layers, and both layers are drawn in the SAME render context / same window (one
  is an overlay of the other). Never stream per-frame positions between windows. Registration
  between the two layers is a fixed geometric offset within that one context.
  - Eventual deployment: one window per dual-layer display unit (five units -> five windows).
    That full multi-window deployment is deferred.
- **Determinism.** Fixed timestep + seeded PRNG, so previews and the show are reproducible.
- **No Electron in v1.** Runs in a normal browser window. Deferred to a later deployment pass.
- **Background gradients.** Each group's background is a multi-color GRADIENT, not one color.
  The number of gradient stops VARIES per group (sparse to dense), reflecting the group's band
  width / density. Choose color words per group from the xkcd color-name -> hex table (~949
  names with real hex) by embedding proximity to the group concept, and / or by sampling across
  the band. Store resolved hex in config; runtime does not re-embed.

### 6a. Flocking laws and per-group relational rules (the hard, central part)

This is the conceptual core, and the calibration here matters more than anywhere else.

- **Iron laws (fixed, always on).** The original three local, neighbor-relative rules -
  separation, alignment, cohesion - exist and act identically for every group. Not changed per
  group.
- **Distinctiveness comes from added abstract RULES, not scripted movement.** The whole point of
  boids is that complex behavior EMERGES from a few highly abstract local rules about how each
  agent treats its neighbors. Per-group character must be built the same way: not by attaching
  motion-verb animations or scripting surface movement, but by adding a few more abstract, local,
  neighbor-relative rules in the same spirit and at the same level of abstraction as Reynolds'
  originals. Distinctive movement (milling, schooling, scattering, swarming) then emerges from the
  rules; it is never drawn directly.
- **Relationship words are the primary input** (more than the motion verbs). Motion words inform
  emergent tendency and parameters; they are not a scripted layer. Curated English lexicons:
  - **group-relationship words** (tight-knit, scattered, solitary, synchronized, chaotic,
    hierarchical...) - how members relate to one another and how groups relate. Primary.
  - **motion / action words** (darting, gliding, drifting, scurrying, undulating...) - secondary,
    a cross-check on the emergent result.
- **A small library of additional abstract relational rules**, each expressible as a simple local
  formula like the core three. Kept general, not specific hacks:
  - selective coupling: align / cohere only with a subset of neighbors (e.g. same kind); yields sub-flocks
  - asymmetric influence: some neighbors weighted more; yields leadership / hierarchy
  - phase synchronization: couple an internal heading / oscillator toward neighbors (fireflies-style)
  - density targeting: seek a preferred local crowding (tight-knit vs dispersed)
  - tangential bias: steer perpendicular to the cohesion vector; milling emerges
  - startle / scatter: transient repulsion when local density spikes; erratic scattering emerges
  - independence: attenuate all neighbor coupling; solitary behavior
  - inter-group attraction / repulsion: relate one group to another
- **Mapping words -> rule composition is the hard step, and likely needs an LLM.** Understand a
  group's relationship words and compose them into a weighted selection over these rules with
  parameters. This translation is where an LLM step earns its place. But the rule library itself
  must stay small and Reynolds-level; the risk to guard against is the added rules collapsing into
  scripted or overly specific behaviors. Keeping the abstraction high is the crux.
- **v1**: embed relationship words (and motion words) and the rule names / descriptions, match by
  proximity to select and weight rules, seed parameters, keep everything human-adjustable. Store
  the trait words, the selected rules and weights, and the parameters in config. A proper
  LLM-assisted words-to-rules mapping can come after the vector-space first pass.

---

## 7. Scope of the FIRST version (v1)

- **Curation is the heart of v1.** The selection pipeline: build the beloved-to-reviled axis
  from two endpoint words, embed the broad animal list, project, rank, band into five groups,
  auto-select gradient colors and trait words per group, seed flocking parameters; plus a
  minimal review UI where the human edits and locks, writing config.json.
- **A rough live preview**, coupled to curation, that runs the 2D flocking for a selected group
  and can switch to show ONE layer look at a time (black dots on white, OR the species look), so
  choices can be judged as they are made. A reference visual, not the production renderer.
- **Not in v1**: Electron, dual-screen registration, the five-window / ten-image production
  deployment, camera interaction, LLM-based word-to-parameter mapping (vector-space word
  selection first).

---

## 8. Out of scope for this project

- COHESION (the haptic desktop knob) is a separate, related project.
- Camera-based audience attractor / repulsor interaction. Dropped for pure optical interaction.
- The old constraint of using only Google products. Choose the best tool per task.

---

## 9. Repo conventions

- config.json is the lock between curation and show. Schema documented in-repo.
- DECISIONS.md is a running log: one line per non-obvious choice, with the reason.
- PROJECT_BRIEF.md (this file) holds intent; keep it current when intent changes.
- Paper writing stays in a separate workstream, never mixed into the build session. But record
  build details as you go; a future agent cannot recover them from code alone.

---

## 10. Open / on-site items

- The two endpoint words for the axis (default beloved / reviled).
- Final band positions and widths, especially the liminal middle band.
- The word-to-parameter mapping approach (vector-space first, possibly LLM-assisted later).
- Registration calibration between the two panels; floating-polarizer distance and angle.

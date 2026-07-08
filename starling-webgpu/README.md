# starling-webgpu

A WebGPU reproduction of the first two views of
[Starling](https://github.com/yumobennyyang/Starling) (`01 COMMON STARLING`,
`02 EMPEROR PENGUIN`), rebuilt as a single instanced GPU pipeline.

## Controls

- **Top-left** — the two flocking behaviours:
  - `01 COMMON STARLING` — 3D murmuration (zone-based separation / alignment / cohesion)
  - `02 EMPEROR PENGUIN` — 2D huddle (per-agent inward/outward spiral + cohesion + separation)
  - `03 BLUR` — toggles a full-page 30px Gaussian blur over the running scene (nav stays sharp)
- **Bottom-right** — the two render modes:
  - `PLAIN` — pure white ground, pure black circular particles (the raw algorithmic form)
  - `WRAPPED` — the original colour-photo background, every agent drawn as one penguin sprite

## How it stays cheap

- The whole simulation runs in a **compute shader**, ping-ponging position/velocity
  storage buffers. No per-frame CPU work, no mouse interaction.
- All 1200 agents are drawn in **one instanced draw call** of a single quad that samples
  **one** penguin texture. Plain mode reuses the same pipeline and draws a circle SDF instead.

## Notes

- The penguin sprite is `public/penguin.png` (a 16px pixel-art penguin). The source art
  points downward, so `makePenguinTextureSource()` rotates it 180° to stand upright, and the
  sampler is `nearest` to keep the pixels crisp.
- The penguin huddle uses a steady inward **centripetal** pull (向心性) modulated by a rotating
  angular wave, so the filled huddle grows travelling **bulges / protrusions** at the crests —
  the emperor-penguin huddle wave. Tune `CENTRIPETAL`, `BULGE_MOD`, `LOBES`, `WSPEED` in `app.js`.
- The starling murmuration uses a wide separation zone (`SEP = 24`) so it reads loose, with a
  firm centre pull to keep it framed.
- Backgrounds (`public/*background*.png`) are copied from the original project.
- Needs a WebGPU browser (Chrome / Edge, or Safari 18+). Serve over http, e.g.
  `python3 -m http.server --directory starling-webgpu`.

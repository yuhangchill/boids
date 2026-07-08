// Pixel Ecologies — WebGPU reproduction of the first two Starling views.
//
// Two flocking behaviours (top-left nav):
//   starling — 3D murmuration, zone-based separation/alignment/cohesion
//   penguin  — 2D huddle, per-agent spiral in/out + cohesion + separation
//
// Two render modes (bottom-right nav):
//   plain   — pure white page, pure black circle particles
//   wrapped — the original colour-photo background, one penguin sprite per agent
//
// Every agent is one instance of a single quad sampling a single penguin
// texture, so the whole flock is one instanced draw call. The simulation runs
// entirely in a compute shader (brute-force O(n^2); n=1200 is nothing on GPU),
// ping-ponging position/velocity buffers. No mouse interaction — pure autonomy.

const MAXN = 1200;
const WORKGROUP = 64;

// ---------------------------------------------------------------- mat4 helpers
// Column-major, WebGPU clip space (z in [0,1], y up).
function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, near * far * nf, 0,
  ];
}
function mat4Multiply(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
function starlingProjView(w, h) {
  const proj = mat4Perspective((75 * Math.PI) / 180, w / h, 0.1, 1000);
  // camera pulled back to z = 350, looking at the origin
  const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -350, 1];
  return mat4Multiply(proj, view);
}
function penguinProj(w, h) {
  // orthographic: pixel space (0..W, 0..H, y-down) -> clip
  return [2 / w, 0, 0, 0, 0, -2 / h, 0, 0, 0, 0, 0, 0, -1, 1, 0.5, 1];
}

// ------------------------------------------------------------------ WGSL: quad
const QUAD = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, 0.5, 0.5,
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
]);

// -------------------------------------------------------- WGSL: shared render
const RENDER_WGSL = /* wgsl */ `
struct RParams {
  proj : mat4x4<f32>,
  viewport : vec2<f32>,
  sizePx : f32,
  mode : f32,        // 0 = plain black circle, 1 = wrapped penguin sprite
};
@group(0) @binding(0) var<storage, read> positions : array<vec4<f32>>;
@group(0) @binding(1) var<uniform> R : RParams;
@group(0) @binding(2) var samp : sampler;
@group(0) @binding(3) var tex : texture_2d<f32>;

struct VOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@location(0) corner : vec2<f32>, @builtin(instance_index) i : u32) -> VOut {
  var out : VOut;
  let center = positions[i].xyz;
  var clip = R.proj * vec4<f32>(center, 1.0);
  // constant screen-space size billboard (multiply by w to survive perspective divide)
  clip.x = clip.x + corner.x * R.sizePx * 2.0 / R.viewport.x * clip.w;
  clip.y = clip.y + corner.y * R.sizePx * 2.0 / R.viewport.y * clip.w;
  out.pos = clip;
  out.uv = corner + vec2<f32>(0.5, 0.5);
  return out;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  if (R.mode < 0.5) {
    let d = distance(in.uv, vec2<f32>(0.5, 0.5));
    let a = 1.0 - smoothstep(0.45, 0.5, d);
    if (a <= 0.0) { discard; }
    return vec4<f32>(0.0, 0.0, 0.0, a);           // premultiplied black
  }
  let c = textureSample(tex, samp, in.uv);
  if (c.a < 0.02) { discard; }
  return vec4<f32>(c.rgb * c.a, c.a);             // premultiplied sprite
}
`;

// ------------------------------------------------------ WGSL: starling compute
const STARLING_WGSL = /* wgsl */ `
struct Params { count : f32, dt : f32, _a : f32, _b : f32 };
@group(0) @binding(0) var<storage, read> posIn : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> velIn : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> posOut : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> velOut : array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> aux : array<vec4<f32>>;
@group(0) @binding(5) var<uniform> P : Params;

const SEP : f32 = 24.0;   // wider separation zone -> looser murmuration
const ALI : f32 = 20.0;
const COH : f32 = 25.0;
const SPEED_LIMIT : f32 = 9.0;
const PI2 : f32 = 6.2831853;

@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  let n = u32(P.count);
  if (i >= n) { return; }
  let dt = P.dt;

  var pos = posIn[i].xyz;
  var vel = velIn[i].xyz;

  let zoneRadius = SEP + ALI + COH;
  let sepThresh = SEP / zoneRadius;
  let aliThresh = (SEP + ALI) / zoneRadius;
  let zoneRadiusSq = zoneRadius * zoneRadius;

  // pull the flock toward centre, with a stronger vertical bias
  var toCenter = pos;
  toCenter.y = toCenter.y * 2.5;
  vel = vel - normalize(toCenter) * dt * 4.5;

  for (var j : u32 = 0u; j < n; j = j + 1u) {
    if (j == i) { continue; }
    let dir = posIn[j].xyz - pos;
    let dsq = dot(dir, dir);
    if (dsq < 0.0001 || dsq > zoneRadiusSq) { continue; }
    let percent = dsq / zoneRadiusSq;

    if (percent < sepThresh) {
      let adj = (sepThresh / percent - 1.0) * dt;
      vel = vel - normalize(dir) * adj;
    } else if (percent < aliThresh) {
      let ap = (percent - sepThresh) / (aliThresh - sepThresh);
      let cr = cos(ap * PI2);
      let adj = (0.5 - cr * 0.5 + 0.5) * dt;
      vel = vel + normalize(velIn[j].xyz) * adj;
    } else {
      let ap = (percent - aliThresh) / (1.0 - aliThresh);
      let cr = cos(ap * PI2);
      let adj = (0.5 - (cr * -0.5 + 0.5)) * dt;
      vel = vel + normalize(dir) * adj;
    }
  }

  let speed = length(vel);
  if (speed > SPEED_LIMIT) { vel = vel / speed * SPEED_LIMIT; }

  pos = pos + vel * dt * 15.0;

  // soft boundaries (±40, margin 10)
  let lim = 40.0;
  let margin = 10.0;
  let bf = 0.05;
  if (pos.x >  lim - margin) { vel.x = vel.x - bf * (1.0 - (lim - pos.x) / margin); }
  if (pos.x < -lim + margin) { vel.x = vel.x + bf * (1.0 - (pos.x + lim) / margin); }
  if (pos.y >  lim - margin) { vel.y = vel.y - bf * (1.0 - (lim - pos.y) / margin); }
  if (pos.y < -lim + margin) { vel.y = vel.y + bf * (1.0 - (pos.y + lim) / margin); }
  if (pos.z >  lim - margin) { vel.z = vel.z - bf * (1.0 - (lim - pos.z) / margin); }
  if (pos.z < -lim + margin) { vel.z = vel.z + bf * (1.0 - (pos.z + lim) / margin); }

  posOut[i] = vec4<f32>(pos, 0.0);
  velOut[i] = vec4<f32>(vel, 0.0);
}
`;

// ------------------------------------------------------- WGSL: penguin compute
// Emperor-penguin huddle. Forces:
//   - CENTRIPETAL  steady inward pull toward the huddle centre (向心性)
//   - BULGE wave   rotating angular lobes that shove penguins outward, so the
//                  huddle grows travelling "protrusions" like the real thing
//   - spiral       per-agent inward->outward breathing (the reference mechanic)
//   - cohesion     toward the local neighbour centroid -> organic clumping
//   - separation   avoid overlap
const PENGUIN_WGSL = /* wgsl */ `
struct Params { count : f32, cx : f32, cy : f32, time : f32 };
@group(0) @binding(0) var<storage, read> posIn : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> velIn : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> posOut : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> velOut : array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> aux : array<vec4<f32>>;   // x=baseAngle y=spiralPhase z=layerRadius
@group(0) @binding(5) var<uniform> P : Params;

const D0 : f32 = 11.0;
const HUDDLE : f32 = 230.0;
const SPIRAL_SPEED : f32 = 0.002;
const COHESION : f32 = 0.5;
const SEPARATION : f32 = 1.0;
const CENTRIPETAL : f32 = 0.2;    // 向心性: base inward pull toward the centre
const BULGE_MOD : f32 = 0.92;     // how much the wave slackens the pull (-> bulge)
const LOBES : f32 = 3.0;          // number of travelling protrusions
const WSPEED : f32 = 0.6;         // how fast the bulges rotate
const MOVE : f32 = 0.5;
const MAX_DIST : f32 = 320.0;
const DAMP : f32 = 0.85;
const PI : f32 = 3.14159265;
const PI2 : f32 = 6.2831853;

@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  let n = u32(P.count);
  if (i >= n) { return; }

  let center = vec2<f32>(P.cx, P.cy);
  var pos = posIn[i].xy;
  var vel = velIn[i].xy;
  var a = aux[i];
  let baseAngle = a.x;
  var phase = a.y;

  let radial = pos - center;
  let dc = length(radial);
  var rdir = vec2<f32>(cos(baseAngle), sin(baseAngle));
  if (dc > 0.001) { rdir = radial / dc; }
  let ang = atan2(radial.y, radial.x);

  // 向心性 with a travelling bulge: a steady inward pull holds the huddle
  // together, but rotating angular lobes slacken that pull, so the filled
  // disk swells outward there -> protrusions that rotate around the edge.
  let wave = max(sin(ang * LOBES - P.time * WSPEED), 0.0);
  let centForce = CENTRIPETAL * (1.0 - BULGE_MOD * wave);
  vel = vel - rdir * centForce;

  // per-agent spiral breathing (inward 0->PI, outward PI->2PI)
  var targetRadius : f32;
  if (phase < PI) { targetRadius = HUDDLE * (1.0 - phase / PI); }
  else            { targetRadius = HUDDLE * ((phase - PI) / PI); }
  let spiralAngle = baseAngle + phase * 0.5;
  let tgt = center + vec2<f32>(cos(spiralAngle), sin(spiralAngle)) * targetRadius;
  let toT = tgt - pos;
  let dT = length(toT);
  if (dT > 0.1) { vel = vel + (toT / dT) * MOVE * 0.1; }

  // cohesion toward the local neighbour centroid + separation from close ones
  let rc = D0 * 8.0;
  var sum = vec2<f32>(0.0, 0.0);
  var cnt = 0.0;
  var sep = vec2<f32>(0.0, 0.0);
  for (var j : u32 = 0u; j < n; j = j + 1u) {
    if (j == i) { continue; }
    let o = posIn[j].xy;
    let dd = o - pos;
    let dist = length(dd);
    if (dist < rc) { sum = sum + o; cnt = cnt + 1.0; }
    if (dist < D0 && dist > 0.1) {
      let force = (D0 - dist) / D0;
      sep = sep + (-dd / dist) * force;
    }
  }
  if (cnt > 0.0) {
    let centroid = sum / cnt;
    vel = vel + (centroid - pos) * COHESION * 0.01;
  }
  vel = vel + sep * SEPARATION;

  // firm outer boundary
  if (dc > MAX_DIST) { vel = vel - rdir * (dc - MAX_DIST) * 0.1; }

  pos = pos + vel;
  vel = vel * DAMP;

  phase = phase + SPIRAL_SPEED;
  if (phase > PI2) { phase = 0.0; }
  aux[i] = vec4<f32>(baseAngle, phase, a.z, 0.0);

  posOut[i] = vec4<f32>(pos, 0.0, 0.0);
  velOut[i] = vec4<f32>(vel, 0.0, 0.0);
}
`;

// --------------------------------------------------------------- app state
const state = {
  view: "starling",   // "starling" | "penguin"
  mode: "plain",      // "plain" | "wrapped"
};

const SIZE = {
  starling: { plain: 4, wrapped: 26 },
  penguin: { plain: 6, wrapped: 20 },
};

const BG = {
  starling: "public/starling_background.png",
  penguin: "public/penguin_background_2.png",
};

// ------------------------------------------------------------ penguin sprite
// Load the pixel-art penguin sprite. The source art points downward, so rotate
// it 180° to stand upright; keep smoothing off so the 16px pixels stay crisp.
async function makePenguinTextureSource() {
  const res = await fetch("public/penguin.png");
  const img = await createImageBitmap(await res.blob());
  const s = img.width;
  const cv = document.createElement("canvas");
  cv.width = s;
  cv.height = s;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.translate(s / 2, s / 2);
  ctx.rotate(Math.PI);
  ctx.drawImage(img, -s / 2, -s / 2);
  return cv;
}

// ---------------------------------------------------------------- init data
function initStarling(posA, velA, aux) {
  for (let i = 0; i < MAXN; i++) {
    posA[i * 4 + 0] = (Math.random() - 0.5) * 80;
    posA[i * 4 + 1] = (Math.random() - 0.5) * 80;
    posA[i * 4 + 2] = (Math.random() - 0.5) * 80;
    posA[i * 4 + 3] = 0;
    velA[i * 4 + 0] = (Math.random() - 0.5) * 10;
    velA[i * 4 + 1] = (Math.random() - 0.5) * 10;
    velA[i * 4 + 2] = (Math.random() - 0.5) * 10;
    velA[i * 4 + 3] = 0;
    aux[i * 4 + 0] = aux[i * 4 + 1] = aux[i * 4 + 2] = aux[i * 4 + 3] = 0;
  }
}
function initPenguin(posA, velA, aux, cx, cy) {
  const layers = 14;
  const perLayer = Math.floor(MAXN / layers);
  const huddle = 270;
  let idx = 0;
  for (let layer = 0; layer < layers && idx < MAXN; layer++) {
    const radius = (layer / (layers - 1)) * (huddle * 0.9);
    const count = Math.max(6, perLayer);
    for (let i = 0; i < count && idx < MAXN; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.02;
      const r = radius + (Math.random() - 0.5) * 2;
      posA[idx * 4 + 0] = cx + Math.cos(angle) * r;
      posA[idx * 4 + 1] = cy + Math.sin(angle) * r;
      posA[idx * 4 + 2] = 0;
      posA[idx * 4 + 3] = 0;
      velA[idx * 4 + 0] = velA[idx * 4 + 1] = velA[idx * 4 + 2] = velA[idx * 4 + 3] = 0;
      aux[idx * 4 + 0] = angle;                 // baseAngle
      aux[idx * 4 + 1] = Math.random() * Math.PI * 2; // spiralPhase
      aux[idx * 4 + 2] = r;                      // layerRadius
      aux[idx * 4 + 3] = 0;
      idx++;
    }
  }
  // fill any remainder
  for (; idx < MAXN; idx++) {
    posA[idx * 4 + 0] = cx;
    posA[idx * 4 + 1] = cy;
    aux[idx * 4 + 1] = Math.random() * Math.PI * 2;
  }
}

// ------------------------------------------------------------------- main
async function main() {
  const canvas = document.getElementById("gfx");
  const bgEl = document.getElementById("bg");

  if (!navigator.gpu) {
    document.getElementById("unsupported").style.display = "flex";
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    document.getElementById("unsupported").style.display = "flex";
    return;
  }
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "premultiplied" });

  // --- penguin sprite texture
  const spriteSource = await makePenguinTextureSource();
  const bitmap = await createImageBitmap(spriteSource);
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height, 1],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: bitmap, flipY: false },
    { texture, premultipliedAlpha: false },
    [bitmap.width, bitmap.height]
  );
  const sampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  // --- buffers
  const bufBytes = MAXN * 16;
  const mkStorage = () =>
    device.createBuffer({
      size: bufBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
  const posA = mkStorage();
  const posB = mkStorage();
  const velA = mkStorage();
  const velB = mkStorage();
  const auxBuf = mkStorage();

  const quadBuf = device.createBuffer({
    size: QUAD.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(quadBuf, 0, QUAD);

  const computeUniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUniform = device.createBuffer({
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // --- compute pipelines (starling + penguin share the buffer layout)
  const computeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ],
  });
  const computePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [computeLayout],
  });
  const starlingPipeline = device.createComputePipeline({
    layout: computePipelineLayout,
    compute: { module: device.createShaderModule({ code: STARLING_WGSL }), entryPoint: "main" },
  });
  const penguinPipeline = device.createComputePipeline({
    layout: computePipelineLayout,
    compute: { module: device.createShaderModule({ code: PENGUIN_WGSL }), entryPoint: "main" },
  });

  // in=A/out=B and in=B/out=A, valid for whichever sim is active
  function computeBindGroup(inPos, inVel, outPos, outVel) {
    return device.createBindGroup({
      layout: computeLayout,
      entries: [
        { binding: 0, resource: { buffer: inPos } },
        { binding: 1, resource: { buffer: inVel } },
        { binding: 2, resource: { buffer: outPos } },
        { binding: 3, resource: { buffer: outVel } },
        { binding: 4, resource: { buffer: auxBuf } },
        { binding: 5, resource: { buffer: computeUniform } },
      ],
    });
  }
  const computeBG = [
    computeBindGroup(posA, velA, posB, velB),
    computeBindGroup(posB, velB, posA, velA),
  ];

  // --- render pipeline
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });
  const renderLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
    ],
  });
  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderLayout] }),
    vertex: {
      module: renderModule,
      entryPoint: "vs",
      buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }],
    },
    fragment: {
      module: renderModule,
      entryPoint: "fs",
      targets: [{
        format,
        blend: {
          color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        },
      }],
    },
    primitive: { topology: "triangle-list" },
  });
  function renderBindGroup(posBuf) {
    return device.createBindGroup({
      layout: renderLayout,
      entries: [
        { binding: 0, resource: { buffer: posBuf } },
        { binding: 1, resource: { buffer: renderUniform } },
        { binding: 2, resource: sampler },
        { binding: 3, resource: texture.createView() },
      ],
    });
  }
  // computeBG[p] writes into posB (p=0) or posA (p=1); render that result
  const renderBG = [renderBindGroup(posB), renderBindGroup(posA)];

  // --- CPU-side staging for (re)initialisation
  const stagePos = new Float32Array(MAXN * 4);
  const stageVel = new Float32Array(MAXN * 4);
  const stageAux = new Float32Array(MAXN * 4);

  let parity = 0;

  function resetSim() {
    // penguin runs entirely in CSS-pixel space (matching the original p5 units);
    // the orthographic projection maps CSS px -> clip, and only the billboard
    // sprite size is converted to device px. starling runs in its own world units.
    if (state.view === "starling") {
      initStarling(stagePos, stageVel, stageAux);
    } else {
      initPenguin(stagePos, stageVel, stageAux, window.innerWidth / 2, window.innerHeight / 2);
    }
    device.queue.writeBuffer(posA, 0, stagePos);
    device.queue.writeBuffer(velA, 0, stageVel);
    device.queue.writeBuffer(auxBuf, 0, stageAux);
    parity = 0;
  }

  // --- resize
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  window.addEventListener("resize", resize);
  resize();
  resetSim();

  // --- UI
  function applyMode() {
    if (state.mode === "wrapped") {
      bgEl.style.backgroundImage = `url("${BG[state.view]}")`;
    } else {
      bgEl.style.backgroundImage = "none";
    }
  }
  document.querySelectorAll("nav.views a[data-view]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      state.view = a.dataset.view;
      document.querySelectorAll("nav.views a[data-view]").forEach((x) => x.classList.remove("active"));
      a.classList.add("active");
      resetSim();
      applyMode();
    });
  });

  // 03 — toggle a full-page 30px Gaussian blur over the running scene
  const blurLink = document.getElementById("nav-blur");
  const blurEl = document.getElementById("blur");
  blurLink.addEventListener("click", (e) => {
    e.preventDefault();
    const on = blurEl.classList.toggle("active");
    blurLink.classList.toggle("active", on);
  });
  document.querySelectorAll("nav.modes a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      state.mode = a.dataset.mode;
      document.querySelectorAll("nav.modes a").forEach((x) => x.classList.remove("active"));
      a.classList.add("active");
      applyMode();
    });
  });
  applyMode();

  // --- render uniform packing
  const rParams = new Float32Array(20);
  function writeRenderUniform(dpr) {
    const w = canvas.width;
    const h = canvas.height;
    // starling: perspective over the device framebuffer. penguin: orthographic
    // over CSS px. Billboard sizing always uses the device viewport below.
    const proj = state.view === "starling"
      ? starlingProjView(w, h)
      : penguinProj(window.innerWidth, window.innerHeight);
    rParams.set(proj, 0);
    rParams[16] = w;
    rParams[17] = h;
    rParams[18] = SIZE[state.view][state.mode] * dpr;
    rParams[19] = state.mode === "wrapped" ? 1 : 0;
    device.queue.writeBuffer(renderUniform, 0, rParams);
  }

  const cParams = new Float32Array(4);
  let last = performance.now();
  const t0 = last;

  function frame() {
    const now = performance.now();
    let dt = (now - last) / 1000;
    if (dt > 0.05) dt = 0.05;
    last = now;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // compute uniforms
    if (state.view === "starling") {
      cParams[0] = MAXN; cParams[1] = dt; cParams[2] = 0; cParams[3] = 0;
    } else {
      cParams[0] = MAXN; cParams[1] = window.innerWidth / 2; cParams[2] = window.innerHeight / 2; cParams[3] = (now - t0) / 1000;
    }
    device.queue.writeBuffer(computeUniform, 0, cParams);
    writeRenderUniform(dpr);

    const encoder = device.createCommandEncoder();

    const cpass = encoder.beginComputePass();
    cpass.setPipeline(state.view === "starling" ? starlingPipeline : penguinPipeline);
    cpass.setBindGroup(0, computeBG[parity]);
    cpass.dispatchWorkgroups(Math.ceil(MAXN / WORKGROUP));
    cpass.end();

    const rpass = encoder.beginRenderPass({
      colorAttachments: [{
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, renderBG[parity]);
    rpass.setVertexBuffer(0, quadBuf);
    rpass.draw(6, MAXN);
    rpass.end();

    device.queue.submit([encoder.finish()]);
    parity ^= 1;
    requestAnimationFrame(frame);
  }

  // --- offline recorder (drives the pipeline by hand at a fixed size) ---------
  window.__cap = {
    ctx2: null,
    begin() {
      state.view = "starling";
      state.mode = "plain";
      document.querySelectorAll("nav.views a").forEach((x) => x.classList.toggle("active", x.dataset.view === "starling"));
      document.querySelectorAll("nav.modes a").forEach((x) => x.classList.toggle("active", x.dataset.mode === "plain"));
      applyMode();
      canvas.width = 1920;
      canvas.height = 1080;
      const c = document.createElement("canvas");
      c.width = 1920; c.height = 1080;
      this.ctx2 = c.getContext("2d");
      this.cap2d = c;
    },
    stepRender() {
      cParams[0] = MAXN; cParams[1] = 0.016; cParams[2] = 0; cParams[3] = 0;
      device.queue.writeBuffer(computeUniform, 0, cParams);
      writeRenderUniform(Math.min(window.devicePixelRatio || 1, 2));
      const enc = device.createCommandEncoder();
      const cp = enc.beginComputePass();
      cp.setPipeline(starlingPipeline);
      cp.setBindGroup(0, computeBG[parity]);
      cp.dispatchWorkgroups(Math.ceil(MAXN / WORKGROUP));
      cp.end();
      const rp = enc.beginRenderPass({
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
      });
      rp.setPipeline(renderPipeline);
      rp.setBindGroup(0, renderBG[parity]);
      rp.setVertexBuffer(0, quadBuf);
      rp.draw(6, MAXN);
      rp.end();
      device.queue.submit([enc.finish()]);
      parity ^= 1;
    },
    async send(idx) {
      await device.queue.onSubmittedWorkDone();
      this.ctx2.fillStyle = "#ffffff";
      this.ctx2.fillRect(0, 0, 1920, 1080);
      this.ctx2.drawImage(canvas, 0, 0, 1920, 1080);
      const url = this.cap2d.toDataURL("image/png");
      await fetch("http://127.0.0.1:5179/f/" + String(idx).padStart(4, "0"), { method: "POST", body: url });
    },
  };

  requestAnimationFrame(frame);
}

main();

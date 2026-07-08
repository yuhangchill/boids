/* Axis Projector — an interactive embedding-space instrument.
   WebGL2 point cloud over a fitted beloved→reviled axis; TF-Projector-style
   selection semantics (labels only for hover / selection / neighbors);
   word arithmetic against the original 256-d space. Dependency-free. */

const FONT = '"ABC Diatype", -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif';
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';
const Q_HEX = ['#ffc366', '#ff9784', '#e77fae', '#a884e8', '#5f9dfd'];
const Q_RGB = Q_HEX.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255));
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const DIMS = 256;

// ---------- tiny mat4 / vec3 ----------

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}
function lookAt(eye, target, up) {
  const z = V.norm(V.sub(eye, target));
  const x = V.norm(V.cross(up, z));
  const y = V.cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1,
  ]);
}
function mul4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

// ---------- data ----------

const D = { meta: null, pos: null, vecs: null, scores: null, n: 0, vocab: new Map() };

async function fetchBin(url, onPart) {
  const r = await fetch(url);
  const total = +r.headers.get('Content-Length') || 0;
  const out = new Uint8Array(total || 8 << 20);
  let got = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, got);
    got += value.length;
    if (total && onPart) onPart(got / total);
  }
  return new Float32Array(out.buffer, 0, got >> 2);
}

// ---------- app state ----------

const layers = { colors: true, gates: true, axis: true, group: false, labels: true, humans: true };
const state = {
  sel: null,               // selected corpus index
  hover: null,
  metric: 'cosine',
  k: 50,
  terms: [],               // [{text, sign, vec, source, pending}]
  q: null,                 // active query vector (Float32Array 256)
  neighbors: [],           // [{i, d}]
  ghost: null,             // 3D position of composite query
};
const focusMode = () => state.sel != null || state.terms.length > 1;

// ---------- camera ----------

const cam = {
  theta: 0.65, phi: 1.12, r: 4.3, target: [0, 0, 0],
  vTheta: 0, vPhi: 0, version: 0,
  fov: (42 * Math.PI) / 180,
  fly: null, // {fromT, toT, fromR, toR, t0, dur}
  eye() {
    const sp = Math.sin(this.phi), e = [
      this.target[0] + this.r * sp * Math.sin(this.theta),
      this.target[1] + this.r * Math.cos(this.phi),
      this.target[2] + this.r * sp * Math.cos(this.theta),
    ];
    return e;
  },
};

let mvp = null, cssW = 0, cssH = 0, dpr = 1;

function updateMatrices() {
  const proj = perspective(cam.fov, cssW / cssH, 0.05, 60);
  mvp = mul4(proj, lookAt(cam.eye(), cam.target, [0, 1, 0]));
  cam.version++;
}

// ---------- WebGL ----------

const glCanvas = document.getElementById('gl');
const gl = glCanvas.getContext('webgl2', { antialias: true, alpha: false });

function makeProgram(vs, fs) {
  const c = (t, s) => {
    const sh = gl.createShader(t);
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, c(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, c(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

const pointProg = makeProgram(
  `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aColor;
  layout(location=2) in float aSize;
  uniform mat4 uMVP; uniform float uFocal;
  out vec3 vColor;
  void main() {
    gl_Position = uMVP * vec4(aPos, 1.0);
    gl_PointSize = clamp(aSize * uFocal / max(gl_Position.w, 0.01), 1.25, 72.0);
    vColor = aColor;
  }`,
  `#version 300 es
  precision mediump float;
  in vec3 vColor; out vec4 frag;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.26, 0.13, d);
    float halo = smoothstep(0.5, 0.16, d) * 0.30;
    frag = vec4(vColor * (core + halo), 0.0);
  }`
);

// opaque vignette ground (additive points need an opaque canvas: with a
// transparent one, rgb > alpha is clamped away by premultiplied compositing)
const bgProg = makeProgram(
  `#version 300 es
  void main() {
    vec2 v = vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1,3))[gl_VertexID];
    gl_Position = vec4(v, 0.0, 1.0);
  }`,
  `#version 300 es
  precision mediump float;
  uniform vec2 uRes; out vec4 frag;
  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float d = distance(uv * vec2(1.2, 0.9), vec2(0.6, 0.52));
    frag = vec4(mix(vec3(0.051, 0.063, 0.090), vec3(0.027, 0.031, 0.047), smoothstep(0.0, 0.75, d)), 1.0);
  }`
);

const lineProg = makeProgram(
  `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aColor;
  uniform mat4 uMVP;
  out vec3 vColor;
  void main() { gl_Position = uMVP * vec4(aPos, 1.0); vColor = aColor; }`,
  `#version 300 es
  precision mediump float;
  in vec3 vColor; uniform float uAlpha; out vec4 frag;
  void main() { frag = vec4(vColor * uAlpha, 0.0); }`
);

let pointVAO, colorBuf, sizeBuf, lineVAO, lineRanges;
let colors, sizes, pickable;

function initPointBuffers() {
  const n = D.n;
  colors = new Float32Array(n * 3);
  sizes = new Float32Array(n);
  pickable = new Uint8Array(n);

  pointVAO = gl.createVertexArray();
  gl.bindVertexArray(pointVAO);
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, D.pos, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  colorBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  sizeBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
}

// axis polyline (gradient) + five gate rings, one static VBO
function axisPoint(s) {
  const { pMean, slope, sMean } = D.meta.axis;
  return V.add(pMean, V.scale(slope, s - sMean));
}

function initLineGeometry() {
  const { sEnds, gates } = D.meta.axis;
  const u = V.norm(D.meta.axis.slope);
  let v = V.cross(u, [0, 1, 0]);
  if (Math.hypot(...v) < 1e-4) v = V.cross(u, [1, 0, 0]);
  v = V.norm(v);
  const w = V.norm(V.cross(u, v));

  const verts = [], cols = [];
  const AXIS_SEG = 32;
  for (let i = 0; i <= AXIS_SEG; i++) {
    const t = i / AXIS_SEG;
    verts.push(...axisPoint(sEnds[0] + (sEnds[1] - sEnds[0]) * t));
    const qi = Math.min(4, t * 5 | 0), qn = Math.min(4, qi + 1);
    cols.push(...V.lerp(Q_RGB[qi], Q_RGB[qn], t * 5 - qi));
  }
  lineRanges = [{ start: 0, count: AXIS_SEG + 1, kind: 'axis' }];

  const RING_SEG = 96;
  gates.forEach((g, b) => {
    const c = axisPoint(g.s), start = verts.length / 3;
    for (let i = 0; i <= RING_SEG; i++) {
      const a = (i / RING_SEG) * Math.PI * 2;
      verts.push(
        c[0] + g.radius * (Math.cos(a) * v[0] + Math.sin(a) * w[0]),
        c[1] + g.radius * (Math.cos(a) * v[1] + Math.sin(a) * w[1]),
        c[2] + g.radius * (Math.cos(a) * v[2] + Math.sin(a) * w[2])
      );
      cols.push(...Q_RGB[b]);
    }
    lineRanges.push({ start, count: RING_SEG + 1, kind: 'ring', bin: b, center: c, radius: g.radius, basis: [v, w] });
  });

  lineVAO = gl.createVertexArray();
  gl.bindVertexArray(lineVAO);
  const pb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const cb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cols), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
}

// ---------- point styling (the TF logic: focus mode grays the world) ----------

function restyle() {
  const { kind, quintile, group } = D.meta;
  const focus = focusMode();
  const nbRank = new Map(state.neighbors.map((nb, r) => [nb.i, r]));
  const k = Math.max(1, state.neighbors.length);

  for (let i = 0; i < D.n; i++) {
    const human = kind[i] === 1;
    let c = [0, 0, 0], size = 0, pick = 0;

    if (human && !layers.humans) {
      // hidden entirely
    } else if (focus) {
      c = [0.062, 0.072, 0.092]; size = 0.006; pick = 1; // the receded world
      const r = nbRank.get(i);
      if (r !== undefined) {
        const t = 1 - r / k;
        c = [1 * (0.3 + 0.7 * t), 0.706 * (0.3 + 0.7 * t), 0.33 * (0.3 + 0.7 * t)];
        size = 0.011 + 0.008 * t;
      }
      if (i === state.sel) { c = [1, 0.98, 0.93]; size = 0.023; }
    } else if (human) {
      c = [0.30, 0.23, 0.14]; size = 0.0075; pick = 1;
    } else {
      const base = layers.colors && quintile[i] >= 0 ? Q_RGB[quintile[i]] : [0.62, 0.69, 0.85];
      let inten = 0.68, sz = 0.012;
      if (layers.group) {
        if (group[i]) { inten = 1.0; sz = 0.017; }
        else { inten = 0.13; sz = 0.008; }
      }
      c = V.scale(base, inten); size = sz; pick = 1;
    }
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
    sizes[i] = size; pickable[i] = pick;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors);
  gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, sizes);
}

// ---------- projection cache & picking ----------

let screenXY = null, screenW = null, screenVersion = -1;

function projectAll() {
  if (screenVersion === cam.version) return;
  screenVersion = cam.version;
  if (!screenXY) { screenXY = new Float32Array(D.n * 2); screenW = new Float32Array(D.n); }
  const m = mvp, p = D.pos;
  for (let i = 0; i < D.n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    screenW[i] = cw;
    if (cw <= 0.01) continue;
    const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw;
    const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw;
    screenXY[i * 2] = (cx * 0.5 + 0.5) * cssW;
    screenXY[i * 2 + 1] = (0.5 - cy * 0.5) * cssH;
  }
}

function projectPoint(pt) {
  const m = mvp;
  const cw = m[3] * pt[0] + m[7] * pt[1] + m[11] * pt[2] + m[15];
  if (cw <= 0.01) return null;
  const cx = (m[0] * pt[0] + m[4] * pt[1] + m[8] * pt[2] + m[12]) / cw;
  const cy = (m[1] * pt[0] + m[5] * pt[1] + m[9] * pt[2] + m[13]) / cw;
  return [(cx * 0.5 + 0.5) * cssW, (0.5 - cy * 0.5) * cssH, cw];
}

function pick(mx, my) {
  projectAll();
  let best = -1, bestD = 12 * 12;
  for (let i = 0; i < D.n; i++) {
    if (!pickable[i] || screenW[i] <= 0.01) continue;
    const dx = screenXY[i * 2] - mx, dy = screenXY[i * 2 + 1] - my;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best === -1 ? null : best;
}

// ---------- overlay labels (canvas 2D) ----------

const ov = document.getElementById('overlay');
const octx = ov.getContext('2d');

function drawLabel(placed, text, x, y, font, color, pad = 3) {
  octx.font = font;
  const w = octx.measureText(text).width;
  const rect = [x + 7, y - 8, w + pad * 2, 15];
  for (const r of placed)
    if (rect[0] < r[0] + r[2] && rect[0] + rect[2] > r[0] && rect[1] < r[1] + r[3] && rect[1] + rect[3] > r[1])
      return false;
  placed.push(rect);
  octx.shadowColor = 'rgba(0,0,0,0.9)';
  octx.shadowBlur = 5;
  octx.fillStyle = color;
  octx.fillText(text, x + 7 + pad, y);
  octx.shadowBlur = 0;
  return true;
}

function ring(x, y, r, color, width = 1.4, dash = null) {
  octx.beginPath();
  if (dash) octx.setLineDash(dash);
  octx.arc(x, y, r, 0, Math.PI * 2);
  octx.strokeStyle = color;
  octx.lineWidth = width;
  octx.stroke();
  octx.setLineDash([]);
}

function mix(hex, wht) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${c.map(v => Math.round(v + (255 - v) * wht)).join(',')})`;
}

function drawOverlay() {
  octx.clearRect(0, 0, cssW, cssH);
  octx.textBaseline = 'middle';
  projectAll();
  const placed = [];
  const focus = focusMode();
  const { words, axis } = D.meta;

  // axis end captions
  if (layers.axis) {
    const ends = [
      [axis.sEnds[0], 'beloved', Q_HEX[0]],
      [axis.sEnds[1], 'reviled', Q_HEX[4]],
    ];
    for (const [s, text, col] of ends) {
      const p = projectPoint(axisPoint(s));
      if (!p) continue;
      octx.font = `600 10px ${FONT}`;
      octx.fillStyle = mix(col, 0.25);
      octx.shadowColor = 'rgba(0,0,0,0.9)'; octx.shadowBlur = 4;
      const t = text.toUpperCase().split('').join('  ');
      const tw = octx.measureText(t).width;
      placed.push([p[0] - tw / 2 - 3, p[1] - 22, tw + 6, 16]);
      octx.fillText(t, p[0] - tw / 2, p[1] - 14);
      octx.shadowBlur = 0;
    }
  }

  // gate numerals at ring tops
  if (layers.gates) {
    for (const g of lineRanges) {
      if (g.kind !== 'ring') continue;
      let top = null;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const [v, w] = g.basis;
        const pt = projectPoint([
          g.center[0] + g.radius * (Math.cos(a) * v[0] + Math.sin(a) * w[0]),
          g.center[1] + g.radius * (Math.cos(a) * v[1] + Math.sin(a) * w[1]),
          g.center[2] + g.radius * (Math.cos(a) * v[2] + Math.sin(a) * w[2]),
        ]);
        if (pt && (!top || pt[1] < top[1])) top = pt;
      }
      if (top) {
        octx.font = `600 10px ${FONT}`;
        const tw = octx.measureText(ROMAN[g.bin]).width;
        placed.push([top[0] - tw / 2 - 3, top[1] - 17, tw + 6, 15]);
        octx.fillStyle = mix(Q_HEX[g.bin], 0.2);
        octx.fillText(ROMAN[g.bin], top[0] - tw / 2, top[1] - 9);
      }
    }
  }

  if (focus) {
    // TF semantics: selected + neighbors carry labels, the world is silent
    if (state.sel != null && screenW[state.sel] > 0.01) {
      const x = screenXY[state.sel * 2], y = screenXY[state.sel * 2 + 1];
      ring(x, y, 9, 'rgba(255,255,255,0.95)', 1.6);
      drawLabel(placed, words[state.sel], x + 4, y, `600 13px ${FONT}`, 'rgba(255,252,245,0.98)');
    }
    const lim = Math.min(state.neighbors.length, 42);
    for (let r = 0; r < lim; r++) {
      const { i } = state.neighbors[r];
      if (screenW[i] <= 0.01) continue;
      const a = 0.92 - (r / lim) * 0.55;
      drawLabel(placed, words[i], screenXY[i * 2], screenXY[i * 2 + 1],
        `400 11px ${FONT}`, `rgba(255,214,150,${a.toFixed(2)})`);
    }
    // ghost marker for composite queries
    if (state.ghost) {
      const p = projectPoint(state.ghost);
      if (p) {
        ring(p[0], p[1], 9, 'rgba(255,255,255,0.85)', 1.3, [4, 3]);
        octx.font = `500 11px ${MONO}`;
        octx.shadowColor = 'rgba(0,0,0,0.9)'; octx.shadowBlur = 5;
        octx.fillStyle = 'rgba(233,237,245,0.95)';
        octx.fillText(formulaText(), p[0] + 14, p[1]);
        octx.shadowBlur = 0;
      }
    }
  } else if (layers.labels) {
    // curated layer: the few that survive quintile + group filtering
    for (const i of D.meta.labels) {
      if (screenW[i] <= 0.01) continue;
      if (layers.group && !D.meta.group[i]) continue;
      drawLabel(placed, words[i], screenXY[i * 2], screenXY[i * 2 + 1],
        `450 11px ${FONT}`, mix(Q_HEX[D.meta.quintile[i]], 0.55));
    }
  }

  // hover: always one label, TF-style
  if (state.hover != null && state.hover !== state.sel && screenW[state.hover] > 0.01) {
    const x = screenXY[state.hover * 2], y = screenXY[state.hover * 2 + 1];
    ring(x, y, 7, 'rgba(255,255,255,0.7)', 1.2);
    octx.shadowColor = 'rgba(0,0,0,0.95)'; octx.shadowBlur = 6;
    octx.font = `500 12px ${FONT}`;
    octx.fillStyle = 'rgba(255,255,255,0.97)';
    octx.fillText(words[state.hover], x + 11, y);
    octx.shadowBlur = 0;
  }
}

// ---------- render loop (on demand) ----------

let rafId = null, needs = false;

function frame() {
  rafId = null;
  if (!mvp || !glCanvas.width) { needs = false; return; }
  let animating = false;

  if (cam.fly) {
    const t = Math.min(1, (performance.now() - cam.fly.t0) / cam.fly.dur);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    cam.target = V.lerp(cam.fly.fromT, cam.fly.toT, e);
    cam.r = cam.fly.fromR + (cam.fly.toR - cam.fly.fromR) * e;
    if (t >= 1) cam.fly = null; else animating = true;
    updateMatrices();
  }
  if (!dragging && (Math.abs(cam.vTheta) > 1e-4 || Math.abs(cam.vPhi) > 1e-4)) {
    cam.theta += cam.vTheta; cam.phi = clampPhi(cam.phi + cam.vPhi);
    cam.vTheta *= 0.92; cam.vPhi *= 0.92;
    updateMatrices();
    animating = true;
  }

  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(bgProg);
  gl.uniform2f(gl.getUniformLocation(bgProg, 'uRes'), glCanvas.width, glCanvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);

  if (layers.axis || layers.gates) {
    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, 'uMVP'), false, mvp);
    const uA = gl.getUniformLocation(lineProg, 'uAlpha');
    gl.bindVertexArray(lineVAO);
    for (const r of lineRanges) {
      if (r.kind === 'axis' && !layers.axis) continue;
      if (r.kind === 'ring' && !layers.gates) continue;
      gl.uniform1f(uA, r.kind === 'axis' ? 0.9 : 0.5);
      gl.drawArrays(gl.LINE_STRIP, r.start, r.count);
    }
  }

  gl.useProgram(pointProg);
  gl.uniformMatrix4fv(gl.getUniformLocation(pointProg, 'uMVP'), false, mvp);
  gl.uniform1f(gl.getUniformLocation(pointProg, 'uFocal'),
    glCanvas.height / 2 / Math.tan(cam.fov / 2));
  gl.bindVertexArray(pointVAO);
  gl.drawArrays(gl.POINTS, 0, D.n);
  gl.bindVertexArray(null);

  drawOverlay();

  needs = false;
  if (animating) kick();
}

function kick() {
  needs = true;
  if (rafId == null) rafId = requestAnimationFrame(frame);
}

const clampPhi = p => Math.min(Math.PI - 0.06, Math.max(0.06, p));

// ---------- interaction ----------

let dragging = false, dragMoved = 0, lastX = 0, lastY = 0, panMode = false;

glCanvas.addEventListener('pointerdown', e => {
  dragging = true; dragMoved = 0;
  panMode = e.shiftKey || e.button === 2 || e.button === 1;
  lastX = e.clientX; lastY = e.clientY;
  cam.vTheta = cam.vPhi = 0;
  cam.fly = null;
  glCanvas.setPointerCapture(e.pointerId);
  document.getElementById('hint').classList.add('gone');
});
glCanvas.addEventListener('pointermove', e => {
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  if (dragging) {
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (panMode) {
      // translate the target in the camera plane
      const s = (cam.r * Math.tan(cam.fov / 2) * 2) / cssH;
      const eye = cam.eye();
      const z = V.norm(V.sub(eye, cam.target));
      const x = V.norm(V.cross([0, 1, 0], z));
      const y = V.cross(z, x);
      cam.target = V.add(cam.target, V.add(V.scale(x, -dx * s), V.scale(y, dy * s)));
    } else {
      cam.theta -= dx * 0.005;
      cam.phi = clampPhi(cam.phi - dy * 0.005);
      cam.vTheta = -dx * 0.0022; cam.vPhi = -dy * 0.0022;
    }
    updateMatrices();
    kick();
  } else {
    const h = pick(e.clientX, e.clientY);
    if (h !== state.hover) {
      state.hover = h;
      glCanvas.style.cursor = h != null ? 'pointer' : 'grab';
      kick();
    }
  }
  lastX = e.clientX; lastY = e.clientY;
});
glCanvas.addEventListener('pointerup', e => {
  dragging = false;
  if (dragMoved < 5 && e.button === 0) {
    const h = pick(e.clientX, e.clientY);
    if (h != null) select(h);
    else deselect();
  }
});
glCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  cam.r = Math.min(14, Math.max(0.5, cam.r * Math.exp(e.deltaY * 0.0011)));
  updateMatrices();
  kick();
}, { passive: false });
glCanvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('search').blur();
    closeSearch();
    deselect();
  }
});

// ---------- neighbors (original 256-d space) ----------

function vecOf(i) {
  return D.vecs.subarray(i * DIMS, (i + 1) * DIMS);
}

function knn(q, k, exclude) {
  const dots = new Float32Array(D.n);
  for (let i = 0; i < D.n; i++) {
    let s = 0;
    const off = i * DIMS;
    for (let j = 0; j < DIMS; j++) s += q[j] * D.vecs[off + j];
    dots[i] = s;
  }
  const idx = [];
  for (let i = 0; i < D.n; i++) if (!exclude.has(i)) idx.push(i);
  idx.sort((a, b) => dots[b] - dots[a]);
  const out = [];
  for (let r = 0; r < Math.min(k, idx.length); r++) {
    const i = idx[r];
    const d = state.metric === 'cosine' ? 1 - dots[i] : Math.sqrt(Math.max(0, 2 - 2 * dots[i]));
    out.push({ i, d, dot: dots[i] });
  }
  return out;
}

function formulaText() {
  return state.terms
    .map((t, i) => (i === 0 ? (t.sign < 0 ? '− ' : '') : t.sign < 0 ? ' − ' : ' + ') + t.text)
    .join('');
}

function runQuery() {
  const ready = state.terms.filter(t => !t.pending && t.vec);
  if (!ready.length) { state.neighbors = []; state.q = null; state.ghost = null; renderNN(); return; }

  const q = new Float32Array(DIMS);
  for (const t of ready)
    for (let j = 0; j < DIMS; j++) q[j] += t.sign * t.vec[j];
  let l = 0;
  for (let j = 0; j < DIMS; j++) l += q[j] * q[j];
  l = Math.sqrt(l) || 1;
  for (let j = 0; j < DIMS; j++) q[j] /= l;
  state.q = q;

  const exclude = new Set(ready.filter(t => t.idx != null).map(t => t.idx));
  state.neighbors = knn(q, state.k, exclude);

  // composite ghost: similarity-weighted mean of the top neighborhood
  if (ready.length > 1) {
    let wsum = 0; const g = [0, 0, 0];
    for (const nb of state.neighbors.slice(0, 12)) {
      const w = Math.pow(Math.max(0, nb.dot), 4);
      wsum += w;
      g[0] += w * D.pos[nb.i * 3]; g[1] += w * D.pos[nb.i * 3 + 1]; g[2] += w * D.pos[nb.i * 3 + 2];
    }
    state.ghost = wsum > 0 ? V.scale(g, 1 / wsum) : null;
  } else state.ghost = null;

  renderNN();
}

// ---------- selection ----------

const $ = id => document.getElementById(id);

function select(i, fly = true) {
  state.sel = i;
  state.terms = [{ text: D.meta.words[i], sign: 1, vec: vecOf(i), idx: i, source: 'corpus' }];
  $('sel-empty').style.display = 'none';
  $('sel-card').classList.add('on');
  $('sel-word').textContent = D.meta.words[i];
  $('sel-kind').textContent = D.meta.kind[i] ? 'human appellation' : 'creature';
  const q = D.meta.quintile[i];
  const qc = $('sel-quintile');
  if (q >= 0) {
    qc.textContent = `quintile ${ROMAN[q]}${D.meta.group[i] ? ' · group-living' : ''}`;
    qc.style.setProperty('--qc', Q_HEX[q]);
  } else { qc.textContent = ''; }
  $('sel-scores').textContent =
    `affection ${fmt(D.scores[i * 2])} · grouping ${fmt(D.scores[i * 2 + 1])}`;
  $('stat-selected').innerHTML = `selected <b>${D.meta.words[i]}</b>`;
  renderChips();
  runQuery();
  restyle();
  if (fly) flyTo([D.pos[i * 3], D.pos[i * 3 + 1], D.pos[i * 3 + 2]]);
  kick();
}

const fmt = v => (v >= 0 ? '+' : '') + v.toFixed(3);

function deselect() {
  if (state.sel == null && state.terms.length === 0) return;
  state.sel = null;
  state.terms = [];
  state.q = null; state.neighbors = []; state.ghost = null;
  $('sel-card').classList.remove('on');
  $('sel-empty').style.display = '';
  $('stat-selected').textContent = '';
  restyle();
  kick();
}

function flyTo(p) {
  cam.fly = {
    fromT: [...cam.target], toT: p,
    fromR: cam.r, toR: Math.min(cam.r, 2.6),
    t0: performance.now(), dur: 700,
  };
  kick();
}

// ---------- formula chips (word arithmetic) ----------

function renderChips() {
  const box = $('chips');
  box.querySelectorAll('.chip').forEach(c => c.remove());
  const input = $('term-input');
  state.terms.forEach((t, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip' + (i === 0 ? ' base' : '') + (t.source === 'api' ? ' api' : '') + (t.pending ? ' pending' : '');
    const sign = document.createElement('span');
    sign.className = 'sign';
    sign.textContent = t.sign < 0 ? '−' : '+';
    sign.title = 'flip sign';
    sign.onclick = () => { t.sign = -t.sign; renderChips(); runQuery(); restyle(); kick(); };
    const word = document.createElement('span');
    word.textContent = t.text;
    chip.append(sign, word);
    if (i > 0) {
      const x = document.createElement('span');
      x.className = 'x'; x.textContent = '✕'; x.title = 'remove';
      x.onclick = () => {
        state.terms.splice(i, 1);
        renderChips(); runQuery(); restyle(); kick();
      };
      chip.append(x);
    }
    box.insertBefore(chip, input);
  });
}

async function addTerm(text) {
  text = text.trim().toLowerCase();
  const err = $('term-err');
  err.classList.remove('on');
  if (!text) return;
  if (state.terms.some(t => t.text === text)) {
    err.textContent = 'already in the formula'; err.classList.add('on'); return;
  }
  const t = { text, sign: 1, vec: null, idx: null, source: 'corpus', pending: false };
  const known = D.vocab.get(text);
  if (known != null) {
    t.vec = vecOf(known); t.idx = known;
  } else {
    t.source = 'api'; t.pending = true;
  }
  state.terms.push(t);
  renderChips();
  if (t.pending) {
    try {
      const r = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: [text] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      const v = new Float32Array(j.vectors[text]);
      let l = 0; for (let x = 0; x < DIMS; x++) l += v[x] * v[x];
      l = Math.sqrt(l) || 1; for (let x = 0; x < DIMS; x++) v[x] /= l;
      t.vec = v; t.pending = false;
      renderChips();
    } catch (e) {
      state.terms = state.terms.filter(x => x !== t);
      renderChips();
      err.textContent = `couldn't embed “${text}” — ${e.message}`;
      err.classList.add('on');
      return;
    }
  }
  runQuery();
  restyle();
  kick();
}

$('term-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { addTerm(e.target.value); e.target.value = ''; }
  if (e.key === 'Backspace' && !e.target.value && state.terms.length > 1) {
    state.terms.pop();
    renderChips(); runQuery(); restyle(); kick();
  }
});

// ---------- neighbor list ----------

function renderNN() {
  $('nn-query').textContent = state.terms.length ? '· ' + formulaText() : '';
  const list = $('nn-list');
  list.innerHTML = '';
  if (!state.neighbors.length) return;
  const dMax = state.neighbors[state.neighbors.length - 1].d || 1;
  for (const nb of state.neighbors) {
    const row = document.createElement('div');
    row.className = 'nn-row';
    const w = document.createElement('span');
    w.className = 'w'; w.textContent = D.meta.words[nb.i];
    const bar = document.createElement('span');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.setProperty('--w', `${Math.max(3, (1 - nb.d / dMax) * 100)}%`);
    bar.append(fill);
    const d = document.createElement('span');
    d.className = 'd'; d.textContent = nb.d.toFixed(3);
    row.append(w, bar, d);
    row.onmouseenter = () => { state.hover = nb.i; kick(); };
    row.onmouseleave = () => { if (state.hover === nb.i) { state.hover = null; kick(); } };
    row.onclick = () => select(nb.i);
    list.append(row);
  }
}

$('knn').addEventListener('input', e => {
  state.k = +e.target.value;
  $('knn-out').textContent = e.target.value;
  e.target.style.setProperty('--fill', `${((state.k - 5) / 95) * 100}%`);
  runQuery();
  restyle();
  kick();
});

$('metric').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  state.metric = b.dataset.m;
  document.querySelectorAll('#metric button').forEach(x => x.classList.toggle('on', x === b));
  runQuery();
  kick();
});

// ---------- search ----------

const searchBox = $('search');
const results = $('search-results');

function closeSearch() { results.classList.remove('open'); }

searchBox.addEventListener('input', () => {
  const qs = searchBox.value.trim();
  if (!qs) return closeSearch();
  let re;
  try { re = new RegExp(qs, 'i'); }
  catch { re = new RegExp(qs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
  const hits = [];
  for (let i = 0; i < D.n; i++) if (re.test(D.meta.words[i])) hits.push(i);
  hits.sort((a, b) => {
    const wa = D.meta.words[a], wb = D.meta.words[b];
    const ea = wa === qs ? 0 : wa.startsWith(qs) ? 1 : 2;
    const eb = wb === qs ? 0 : wb.startsWith(qs) ? 1 : 2;
    return ea - eb || wa.length - wb.length || (wa < wb ? -1 : 1);
  });
  results.innerHTML = `<div class="count">${hits.length} match${hits.length === 1 ? '' : 'es'}</div>`;
  for (const i of hits.slice(0, 18)) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span>${D.meta.words[i]}</span><span class="k">${D.meta.kind[i] ? 'human' : 'creature'}</span>`;
    row.addEventListener('mousedown', e => {
      e.preventDefault();
      select(i);
      closeSearch();
      searchBox.value = '';
    });
    results.append(row);
  }
  results.classList.toggle('open', hits.length > 0);
  searchBox.dataset.first = hits[0] ?? '';
});
searchBox.addEventListener('keydown', e => {
  if (e.key === 'Enter' && searchBox.dataset.first !== '') {
    select(+searchBox.dataset.first);
    closeSearch();
    searchBox.value = '';
    searchBox.blur();
  }
});
searchBox.addEventListener('blur', () => setTimeout(closeSearch, 150));

// ---------- layer toggles ----------

document.querySelectorAll('.layer-row').forEach(row => {
  row.addEventListener('click', () => {
    const k = row.dataset.layer;
    layers[k] = !layers[k];
    row.toggleAttribute('data-on', layers[k]);
    restyle();
    kick();
  });
});

// ---------- resize ----------

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  cssW = innerWidth; cssH = innerHeight;
  if (!cssW || !cssH) return; // hidden/zero-size viewport: wait for a real layout
  glCanvas.width = cssW * dpr; glCanvas.height = cssH * dpr;
  ov.width = cssW * dpr; ov.height = cssH * dpr;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateMatrices();
  kick();
}
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', resize);

// ---------- boot ----------

async function boot() {
  const fill = $('load-fill'), sub = $('load-sub');
  const prog = (p, t) => { fill.style.width = `${(p * 100) | 0}%`; if (t) sub.textContent = t; };

  prog(0.04, 'fetching metadata…');
  D.meta = await (await fetch('data/meta.json')).json();
  D.n = D.meta.words.length;
  D.meta.words.forEach((w, i) => D.vocab.set(w, i));
  prog(0.14, 'fetching positions…');
  D.pos = await fetchBin('data/positions.bin', p => prog(0.14 + p * 0.06));
  D.scores = await fetchBin('data/scores.bin', p => prog(0.2 + p * 0.05));
  prog(0.25, 'fetching 256-d vectors…');
  D.vecs = await fetchBin('data/vectors.bin', p => prog(0.25 + p * 0.7, undefined));

  $('stat-points').textContent = D.n.toLocaleString();
  initPointBuffers();
  initLineGeometry();
  restyle();
  resize();
  prog(1, 'ready');
  $('loading').classList.add('gone');
}

boot().catch(e => {
  $('load-sub').textContent = `failed: ${e.message} — run pipeline/precompute.py first`;
  console.error(e);
});

// scripted access for verification & debugging
window.__projector = {
  layers, state, cam, D,
  select: w => { const i = D.vocab.get(w); if (i != null) select(i); return i; },
  addTerm,
  setLayer: (k, v) => { layers[k] = v; document.querySelector(`[data-layer="${k}"]`)?.toggleAttribute('data-on', v); restyle(); kick(); },
  deselect,
};

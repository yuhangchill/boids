// The window: a rough live preview coupled to curation. One group at a time,
// one layer look at a time — a reference for judgment, not the production
// renderer. Fixed-timestep accumulator over the deterministic sim.

import type { Store } from './state';
import { el } from './state';
import { Flock, DT, WORLD } from '../sim/flock';
import { drawFrame, type Look } from '../render/draw';

export function renderPreview(root: HTMLElement, store: Store): void {
  let look: Look = 'particle';
  let running = true;
  let flock = new Flock([store.cfg.groups[store.previewGroup]]);

  root.textContent = '';

  // -- group tabs --
  const tabs = el('div', { class: 'pv-tabs', role: 'tablist' });
  const renderTabs = () => {
    tabs.textContent = '';
    for (const g of store.cfg.groups) {
      const b = el('button', {
        class: 'pv-tab' + (g.index === store.previewGroup ? ' on' : ''),
        type: 'button',
        role: 'tab',
      }, g.label);
      b.setAttribute('aria-selected', String(g.index === store.previewGroup));
      b.addEventListener('click', () => {
        store.previewGroup = g.index;
        store.signal('meta');
      });
      tabs.append(b);
    }
  };
  renderTabs();

  // -- look toggle: exactly one layer look at a time --
  const lookBtns: HTMLButtonElement[] = [];
  const lookRow = el('div', { class: 'pv-looks' });
  const mkLook = (id: Look, label: string) => {
    const b = el('button', { class: 'pv-look', type: 'button' }, label) as HTMLButtonElement;
    b.addEventListener('click', () => {
      look = id;
      syncLooks();
    });
    lookBtns.push(b);
    lookRow.append(b);
    return b;
  };
  mkLook('particle', 'black dots on a pure white background');
  mkLook('species', 'species — gradient · color · names');
  const syncLooks = () => {
    lookBtns.forEach((b, i) => {
      const on = (i === 0 ? 'particle' : 'species') === look;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  syncLooks();

  // -- canvas --
  const canvas = el('canvas', { class: 'pv-canvas' }) as HTMLCanvasElement;
  canvas.setAttribute('role', 'img');
  const ctx = canvas.getContext('2d')!;

  // -- transport --
  const playBtn = el('button', { class: 'btn', type: 'button' }, 'pause');
  playBtn.addEventListener('click', () => {
    running = !running;
    playBtn.textContent = running ? 'pause' : 'run';
  });
  const restartBtn = el('button', { class: 'btn', type: 'button' }, 'restart');
  restartBtn.addEventListener('click', () => rebuild());
  const readout = el('span', { class: 'pv-readout' }, '');

  root.append(
    el('div', { class: 'pv-head' }, el('span', { class: 'plate-label' }, 'window'), tabs),
    lookRow,
    canvas,
    el('div', { class: 'pv-transport' }, playBtn, restartBtn, readout),
    el(
      'p',
      { class: 'pv-note' },
      'both layers are drawn from one simulation in one render context; ' +
        'the production pass replaces names with recognizable imagery.',
    ),
  );

  const group = () => store.cfg.groups[store.previewGroup];

  function rebuild(): void {
    flock = new Flock([group()]);
  }

  store.onChange((kind) => {
    if (kind === 'meta') {
      renderTabs();
      return;
    }
    if (kind === 'structure') rebuild();
    if (kind === 'group' && store.lastChangedGroup === store.previewGroup) {
      flock.updateGroup(0, group());
    }
  });

  // track preview group switches (signalled as 'meta')
  let shownGroup = store.previewGroup;
  const ensureGroup = () => {
    if (shownGroup !== store.previewGroup) {
      shownGroup = store.previewGroup;
      rebuild();
    }
  };

  // -- loop --
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    ensureGroup();
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    if (running) {
      while (acc >= DT) {
        flock.step();
        acc -= DT;
      }
    } else acc = 0;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round((rect.width * WORLD.h) / WORLD.w * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    drawFrame(ctx, w / dpr, h / dpr, dpr, flock.boids, group(), look);
    canvas.setAttribute(
      'aria-label',
      `flocking preview, group ${group().label}, ${look} look`,
    );
    readout.textContent =
      `${group().label} · ${group().sim.count} agents · seed ${group().sim.seed} · t ${flock.time.toFixed(1)}s`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

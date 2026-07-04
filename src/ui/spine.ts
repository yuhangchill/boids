// The spine: the entire ranked axis as one typographic column — every
// candidate with its projection score, beloved at the top, reviled at the
// bottom. Band boundaries are the draggable rules between rows: the cut IS
// the piece of interface.

import type { Store } from './state';
import { el } from './state';
import { membersFromCuts } from '../config/schema';

const DESIGNATION = [
  'most beloved',
  'beloved',
  'liminal middle',
  'reviled',
  'most reviled',
] as const;

export { DESIGNATION };

export function renderSpine(root: HTMLElement, store: Store): void {
  root.textContent = '';
  const { animals, bandCuts } = store.cfg;

  // gap index of each cut = how many animals sit above it
  const gaps = bandCuts.map((c) => animals.filter((a) => a.score > c).length);

  const list = el('div', { class: 'sp-list' });

  for (let i = 0; i <= animals.length; i++) {
    const band = gaps.filter((g) => g <= i).length;
    if (i === 0 || gaps.includes(i)) {
      const cutIdx = gaps.indexOf(i); // -1 for the top header
      const head = el(
        'div',
        {
          class: 'sp-band' + (cutIdx >= 0 ? ' sp-cut' : ''),
          'data-band': String(band),
        },
        el('span', { class: 'sp-roman' }, store.cfg.groups[band]?.label ?? ''),
        el('span', { class: 'sp-designation' }, DESIGNATION[band]),
        cutIdx >= 0
          ? el('span', { class: 'sp-cutscore' }, bandCuts[cutIdx].toFixed(4))
          : el('span', { class: 'sp-cutscore' }, ''),
      );
      if (cutIdx >= 0) attachDrag(head, cutIdx, list, store);
      list.append(head);
    }
    if (i === animals.length) break;
    const a = animals[i];
    list.append(
      el(
        'div',
        { class: 'sp-row', 'data-band': String(band) },
        el('span', { class: 'sp-score' }, a.score.toFixed(4)),
        el('span', { class: 'sp-name' }, a.name),
      ),
    );
  }

  root.append(
    el(
      'div',
      { class: 'sp-head' },
      el('span', {}, `index — ${animals.length} candidates`),
      el('span', { class: 'sp-axis-word' }, store.cfg.axis.positive),
    ),
    list,
    el('div', { class: 'sp-foot' }, el('span', { class: 'sp-axis-word' }, store.cfg.axis.negative)),
  );
}

function attachDrag(handle: HTMLElement, cutIdx: number, list: HTMLElement, store: Store): void {
  handle.addEventListener('pointerdown', (e0) => {
    e0.preventDefault();
    handle.setPointerCapture(e0.pointerId);
    handle.classList.add('dragging');
    const rows = [...list.querySelectorAll<HTMLElement>('.sp-row')];
    const { animals, bandCuts } = store.cfg;
    // a band must keep at least one member
    const lo = (cutIdx === 0 ? 0 : animals.filter((a) => a.score > bandCuts[cutIdx - 1]).length) + 1;
    const hi =
      (cutIdx === 3 ? animals.length : animals.filter((a) => a.score > bandCuts[cutIdx + 1]).length) - 1;

    let gap = animals.filter((a) => a.score > bandCuts[cutIdx]).length;

    const move = (e: PointerEvent) => {
      let best = gap;
      let bestD = Infinity;
      for (let g = lo; g <= hi; g++) {
        const r = rows[g - 1].getBoundingClientRect();
        const d = Math.abs(e.clientY - r.bottom);
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      if (best !== gap) {
        gap = best;
        handle.style.transform = '';
        rows[gap - 1].after(handle);
      }
    };
    const up = () => {
      handle.classList.remove('dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      const cut = (animals[gap - 1].score + animals[gap].score) / 2;
      const cuts = [...store.cfg.bandCuts] as typeof store.cfg.bandCuts;
      cuts[cutIdx] = Math.round(cut * 10000) / 10000;
      store.cfg.bandCuts = cuts;
      const bands = membersFromCuts(animals, cuts);
      store.cfg.groups.forEach((g, i) => (g.members = bands[i]));
      store.touch('structure');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

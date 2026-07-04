// The five band plates: per group — its gradient (with the color words and
// their anchors), its members, its trait words, its rule composition, its
// sim parameters. Everything the human edits before locking.

import type { GroupConfig, RuleSelection } from '../config/schema';
import type { Store } from './state';
import { el } from './state';
import { gradientCss } from '../render/draw';
import { RULE_LIBRARY, RULE_BY_ID, defaultParams } from '../sim/rules';
import { RELATIONSHIP_WORDS, MOTION_WORDS } from '../../data/lexicon';
import { DESIGNATION } from './spine';

export function renderPlates(root: HTMLElement, store: Store): void {
  root.textContent = '';
  for (const group of store.cfg.groups) root.append(renderPlate(group, store));
}

function renderPlate(g: GroupConfig, store: Store): HTMLElement {
  const touch = () => {
    store.lastChangedGroup = g.index;
    store.touch('group');
  };

  const plate = el('section', { class: 'plate', 'data-band': String(g.index), id: `plate-${g.index}` });

  // -- header --
  const view = el('button', { class: 'btn', type: 'button' }, 'view ⟶');
  view.addEventListener('click', () => {
    store.previewGroup = g.index;
    store.signal('meta');
  });
  plate.append(
    el(
      'header',
      { class: 'plate-head' },
      el('span', { class: 'plate-roman' }, g.label),
      el(
        'div',
        { class: 'plate-title' },
        el('div', { class: 'plate-designation' }, DESIGNATION[g.index]),
        el(
          'div',
          { class: 'plate-count' },
          `${g.members.length} members · ${g.gradient.length} gradient stops`,
        ),
      ),
      view,
    ),
  );

  // -- gradient figure --
  const bar = el('div', { class: 'grad-bar' });
  bar.style.background = gradientCss(g, '90deg');
  const caps = el(
    'div',
    { class: 'grad-caps' },
    ...g.gradient.map((s, i) => {
      const hexIn = el('input', {
        class: 'hex-in',
        value: s.hex,
        spellcheck: 'false',
        'aria-label': `stop ${i} hex`,
      }) as HTMLInputElement;
      hexIn.addEventListener('change', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(hexIn.value)) {
          g.gradient[i].hex = hexIn.value;
          bar.style.background = gradientCss(g, '90deg');
          touch();
        } else hexIn.value = s.hex;
      });
      return el(
        'div',
        { class: 'grad-cap' },
        el('span', { class: 'cap-swatch' }),
        el('span', { class: 'cap-name' }, s.name),
        hexIn,
        el('span', { class: 'cap-anchor' }, `⌁ ${s.anchor}`),
      );
    }),
  );
  caps.querySelectorAll<HTMLElement>('.cap-swatch').forEach((sw, i) => {
    sw.style.background = g.gradient[i].hex;
  });
  plate.append(el('figure', { class: 'plate-grad' }, bar, caps));

  // -- members --
  plate.append(
    el('div', { class: 'plate-label' }, 'members'),
    el('p', { class: 'plate-members' }, g.members.join(', ')),
  );

  // -- traits --
  plate.append(
    el('div', { class: 'plate-label' }, 'relationship — primary'),
    wordRow(g, 'relationship', RELATIONSHIP_WORDS, touch),
    el('div', { class: 'plate-label' }, 'motion — cross-check'),
    wordRow(g, 'motion', MOTION_WORDS, touch),
  );

  // -- rules --
  plate.append(el('div', { class: 'plate-label' }, 'rule composition — iron laws always on'));
  const rulesBox = el('div', { class: 'rules' });
  const renderRules = () => {
    rulesBox.textContent = '';
    for (const sel of g.rules) rulesBox.append(ruleRow(g, sel, touch, renderRules));
    const remaining = RULE_LIBRARY.filter((r) => !g.rules.some((s) => s.id === r.id));
    if (remaining.length > 0) {
      const add = el('select', { class: 'rule-add' }) as HTMLSelectElement;
      add.append(el('option', { value: '' }, '+ add rule'));
      for (const r of remaining) add.append(el('option', { value: r.id }, r.name.toLowerCase()));
      add.addEventListener('change', () => {
        const def = RULE_BY_ID.get(add.value as RuleSelection['id']);
        if (!def) return;
        g.rules.push({ id: def.id, weight: 0.5, params: defaultParams(def) });
        touch();
        renderRules();
      });
      rulesBox.append(add);
    }
  };
  renderRules();
  plate.append(rulesBox);

  // -- sim --
  plate.append(el('div', { class: 'plate-label' }, 'simulation — deterministic'));
  const simRow = el('div', { class: 'sim-row' });
  const num = (label: string, get: () => number, set: (v: number) => void, w = 6) => {
    const input = el('input', {
      class: 'num-in',
      value: String(get()),
      inputmode: 'numeric',
      'aria-label': label,
    }) as HTMLInputElement;
    input.style.width = `${w}ch`;
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) {
        set(v);
        touch();
      } else input.value = String(get());
    });
    return el('label', { class: 'sim-field' }, el('span', {}, label), input);
  };
  simRow.append(
    num('count', () => g.sim.count, (v) => (g.sim.count = Math.max(1, Math.round(v)))),
    num('max speed', () => g.sim.maxSpeed, (v) => (g.sim.maxSpeed = v)),
    num('seed', () => g.sim.seed, (v) => (g.sim.seed = Math.round(v)), 12),
  );
  plate.append(simRow);

  return plate;
}

function wordRow(
  g: GroupConfig,
  kind: 'relationship' | 'motion',
  lexicon: readonly string[],
  touch: () => void,
): HTMLElement {
  const row = el('div', { class: `words words-${kind}` });
  const render = () => {
    row.textContent = '';
    for (const t of g.traits[kind]) {
      const chip = el(
        'button',
        { class: 'word', type: 'button', title: `affinity ${t.affinity} — click to remove` },
        t.word,
        el('sup', { class: 'word-aff' }, t.affinity.toFixed(3).replace(/^0/, '')),
      );
      chip.addEventListener('click', () => {
        g.traits[kind] = g.traits[kind].filter((x) => x.word !== t.word);
        touch();
        render();
      });
      row.append(chip);
    }
    const listId = `lex-${kind}-${g.index}`;
    const input = el('input', {
      class: 'word-add',
      placeholder: '+ word',
      list: listId,
      'aria-label': `add ${kind} word`,
    }) as HTMLInputElement;
    const dl = el('datalist', { id: listId });
    for (const w of lexicon)
      if (!g.traits[kind].some((t) => t.word === w)) dl.append(el('option', { value: w }));
    input.addEventListener('change', () => {
      const w = input.value.trim();
      if (w && !g.traits[kind].some((t) => t.word === w)) {
        g.traits[kind].push({ word: w, affinity: NaN });
        touch();
        render();
      }
      input.value = '';
    });
    row.append(input, dl);
  };
  render();
  return row;
}

function ruleRow(
  g: GroupConfig,
  sel: RuleSelection,
  touch: () => void,
  rerender: () => void,
): HTMLElement {
  const def = RULE_BY_ID.get(sel.id)!;
  const weightOut = el('span', { class: 'rule-wout' }, sel.weight.toFixed(2));
  const slider = el('input', {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.01',
    value: String(sel.weight),
    'aria-label': `${def.name} weight`,
  }) as HTMLInputElement;
  slider.addEventListener('input', () => {
    sel.weight = Number(slider.value);
    weightOut.textContent = sel.weight.toFixed(2);
    touch();
  });

  const params = el(
    'span',
    { class: 'rule-params' },
    ...def.params.map((p) => {
      const input = el('input', {
        class: 'num-in',
        value: String(sel.params[p.key] ?? p.default),
        inputmode: 'decimal',
        'aria-label': `${def.name} ${p.label}`,
      }) as HTMLInputElement;
      input.style.width = `${Math.max(4, String(p.max).length + 2)}ch`;
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (Number.isFinite(v)) {
          sel.params[p.key] = Math.min(p.max, Math.max(p.min, v));
          input.value = String(sel.params[p.key]);
          touch();
        } else input.value = String(sel.params[p.key]);
      });
      return el('label', { class: 'rule-param' }, el('span', {}, p.label), input);
    }),
  );

  const remove = el('button', { class: 'rule-x', type: 'button', 'aria-label': `remove ${def.name}` }, '×');
  remove.addEventListener('click', () => {
    g.rules = g.rules.filter((r) => r !== sel);
    touch();
    rerender();
  });

  return el(
    'div',
    { class: 'rule' },
    el(
      'div',
      { class: 'rule-name' },
      def.name.toLowerCase(),
      el('div', { class: 'rule-emerges' }, `⟶ ${def.emerges}`),
    ),
    slider,
    weightOut,
    params,
    remove,
  );
}

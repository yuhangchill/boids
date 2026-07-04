// Boids — curation. Masthead, spine, plates, window.

import type { BoidsConfig } from '../config/schema';
import { Store, fetchConfig, el } from './state';
import { renderSpine } from './spine';
import { renderPlates } from './plates';
import { renderPreview } from './preview';

const app = document.getElementById('app')!;

async function boot(): Promise<void> {
  let cfg: BoidsConfig | null = null;
  let error = '';
  try {
    cfg = await fetchConfig();
  } catch (e) {
    error = String(e);
  }
  app.removeAttribute('aria-busy');

  if (!cfg) {
    app.append(
      el(
        'div',
        { class: 'empty' },
        el('div', { class: 'empty-title' }, 'Boids — curation'),
        el(
          'p',
          { class: 'empty-body' },
          'No config.json yet. Run the pipeline first — it builds the beloved → reviled axis ' +
            'from two endpoint words, projects the candidates, bands them into five groups, and ' +
            'derives each group’s gradient, trait words, and rule composition:',
        ),
        el('pre', { class: 'empty-cmd' }, 'npm run curate'),
        error ? el('p', { class: 'empty-err' }, error) : '',
      ),
    );
    return;
  }

  const store = new Store(cfg);
  document.title = 'Boids · Curation';

  // -- masthead --
  const dirtyDot = el('span', { class: 'dot' });
  const saveBtn = el('button', { class: 'btn', type: 'button' }, 'save');
  const lockBtn = el('button', { class: 'btn btn-lock', type: 'button' }, '');
  const meta = el('span', { class: 'mast-meta' });

  const syncMeta = () => {
    dirtyDot.classList.toggle('on', store.dirty);
    lockBtn.textContent = store.cfg.locked ? 'locked' : 'lock';
    lockBtn.classList.toggle('on', store.cfg.locked);
    lockBtn.setAttribute('aria-pressed', String(store.cfg.locked));
    document.body.classList.toggle('is-locked', store.cfg.locked);
    meta.textContent =
      `${store.cfg.embedding.model} · ${store.cfg.animals.length} candidates · ` +
      `${store.cfg.generatedAt.slice(0, 10)}${store.cfg.locked ? ' · locked' : ''}`;
  };

  saveBtn.addEventListener('click', () => void save());
  lockBtn.addEventListener('click', () => {
    store.cfg.locked = !store.cfg.locked;
    void save();
  });
  async function save(): Promise<void> {
    try {
      await store.save();
    } catch (e) {
      alert(String(e));
    }
    syncMeta();
  }
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      void save();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (store.dirty) e.preventDefault();
  });

  app.append(
    el(
      'header',
      { class: 'masthead' },
      el('div', { class: 'mast-name' }, el('h1', {}, 'Boids'), el('span', { class: 'mast-sub' }, 'curation')),
      el(
        'div',
        { class: 'mast-axis' },
        el('span', { class: 'mast-word' }, cfg.axis.positive),
        el('span', { class: 'mast-rule' }),
        el('span', { class: 'mast-word' }, cfg.axis.negative),
      ),
      el('div', { class: 'mast-actions' }, meta, dirtyDot, saveBtn, lockBtn),
    ),
  );

  const spine = el('nav', { class: 'spine' });
  const plates = el('main', { class: 'plates' });
  const win = el('aside', { class: 'window' });
  app.append(el('div', { class: 'frame' }, spine, plates, win));

  renderSpine(spine, store);
  renderPlates(plates, store);
  renderPreview(win, store);

  store.onChange((kind) => {
    syncMeta();
    if (kind === 'structure') {
      renderSpine(spine, store);
      renderPlates(plates, store);
    }
  });
  syncMeta();
}

void boot();

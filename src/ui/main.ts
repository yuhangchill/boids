import "./styles.css";
import { Store } from "./store.js";
import { ReviewPanel } from "./review.js";
import { Preview, type LookMode } from "./preview.js";

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

function toast(msg: string, isErr = false): void {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast${isErr ? " err" : ""}`;
  t.hidden = false;
  window.clearTimeout((t as any)._timer);
  (t as any)._timer = window.setTimeout(() => (t.hidden = true), 2600);
}

async function boot(): Promise<void> {
  const store = new Store();
  const reviewBody = $("#review-body");
  const preview = new Preview($<HTMLCanvasElement>("#stage"));

  preview.onFps = (fps) => ($("#fps").textContent = `${fps} fps`);
  preview.onCaption = (text) => ($("#preview-caption").textContent = text);

  try {
    await store.load();
  } catch (err) {
    reviewBody.innerHTML = `<p class="loading">Could not load config.json.<br/><br/>Run <code>npm run curate</code> first, then reload.<br/><br/><span style="color:#ff6b6b">${
      err instanceof Error ? err.message : String(err)
    }</span></p>`;
    return;
  }

  const cfg = store.config!;
  preview.setConfig(cfg);

  // Axis spine + provenance note.
  $("#axis-pos").textContent = cfg.axis.positiveWord;
  $("#axis-neg").textContent = cfg.axis.negativeWord;
  if (cfg.meta.notes) $("#meta-note").textContent = cfg.meta.notes;

  // Group selector.
  const optLabel = (b: (typeof cfg.bands)[number]) =>
    `${String(b.index + 1).padStart(2, "0")} — ${b.label} · ${b.members.length}`;
  const sel = $<HTMLSelectElement>("#sel-group");
  sel.replaceChildren();
  for (const b of cfg.bands) {
    sel.append(new Option(optLabel(b), String(b.index)));
  }

  const review = new ReviewPanel(reviewBody, store, {
    onDirty: () => updateSaveState(),
    onSelect: (idx) => {
      sel.value = String(idx);
      preview.selectGroup(idx);
    },
    onBandEdited: (idx) => {
      if (review.selectedIndex === idx) preview.refreshBand();
      // Keep the group dropdown labels' counts fresh after re-band.
      for (let i = 0; i < cfg.bands.length; i++) {
        (sel.options[i] as HTMLOptionElement).text = optLabel(cfg.bands[i]);
      }
    },
  });
  review.render();

  sel.addEventListener("change", () => review.select(Number(sel.value)));

  // Look toggle (one layer at a time, per the brief).
  const setLook = (look: LookMode) => {
    preview.setLook(look);
    $("#look-particle").classList.toggle("active", look === "particle");
    $("#look-species").classList.toggle("active", look === "species");
  };
  $("#look-particle").addEventListener("click", () => setLook("particle"));
  $("#look-species").addEventListener("click", () => setLook("species"));

  // Transport.
  $("#btn-play").addEventListener("click", () => {
    const running = preview.togglePlay();
    $("#btn-play").textContent = running ? "Pause" : "Play";
  });
  $("#btn-reseed").addEventListener("click", () => preview.reseed());

  // Save / lock.
  const btnSave = $<HTMLButtonElement>("#btn-save");
  const btnLock = $<HTMLButtonElement>("#btn-lock");
  const updateSaveState = () => {
    btnSave.textContent = store.dirty ? "Save config.json •" : "Save config.json";
    btnLock.textContent = cfg.meta.locked ? "Locked ✓" : "Lock";
    btnLock.classList.toggle("locked", cfg.meta.locked);
  };
  btnSave.addEventListener("click", async () => {
    try {
      await store.save();
      updateSaveState();
      toast("Saved config.json");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    }
  });
  btnLock.addEventListener("click", async () => {
    cfg.meta.locked = !cfg.meta.locked;
    store.markDirty();
    try {
      await store.save();
      updateSaveState();
      toast(cfg.meta.locked ? "Locked & saved" : "Unlocked & saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    }
  });

  // Kick off preview on the first group.
  preview.selectGroup(0);
  setLook("particle");
  preview.start();
  updateSaveState();
}

boot();

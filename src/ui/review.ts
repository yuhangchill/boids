import type { Band, SelectedRule } from "../shared/types.js";
import { Store, RULE_LIBRARY, nearestColorName } from "./store.js";

export interface ReviewCallbacks {
  onDirty: () => void;
  /** A band was selected for the preview. */
  onSelect: (bandIndex: number) => void;
  /** A band's design (gradient/rules) changed; refresh preview if it's shown. */
  onBandEdited: (bandIndex: number) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown>;
  if (cls) node.className = cls as string;
  Object.assign(node, rest);
  for (const c of children) node.append(c);
  return node;
}

function gradientCss(band: Band): string {
  const stops = [...band.gradient.stops].sort((a, b) => a.pos - b.pos);
  if (stops.length === 0) return "#333";
  if (stops.length === 1) return stops[0].hex;
  const parts = stops.map((s) => `${s.hex} ${Math.round(s.pos * 100)}%`);
  return `linear-gradient(${band.gradient.angle}deg, ${parts.join(", ")})`;
}

export class ReviewPanel {
  private selected = 0;
  private open = new Set<number>([0]);

  constructor(
    private root: HTMLElement,
    private store: Store,
    private cb: ReviewCallbacks
  ) {}

  get selectedIndex(): number {
    return this.selected;
  }

  select(index: number): void {
    this.selected = index;
    this.open.add(index);
    this.render();
    this.cb.onSelect(index);
  }

  render(): void {
    const cfg = this.store.config;
    if (!cfg) return;
    this.root.replaceChildren();

    const intro = el("p", { class: "colophon" }, [
      `${cfg.animals.length} animals · axis E("${cfg.axis.positiveWord}") − E("${cfg.axis.negativeWord}") · ${cfg.meta.provider} / ${cfg.meta.model} · click a band to preview`,
    ]);
    this.root.append(intro);

    for (const band of cfg.bands) this.root.append(this.renderBand(band));
  }

  private renderBand(band: Band): HTMLElement {
    const cfg = this.store.config!;
    const wrap = el("div", {
      class: `band${this.open.has(band.index) ? " open" : ""}${this.selected === band.index ? " selected" : ""}`,
    });

    const swatch = el("div", { class: "band-swatch" });
    swatch.style.background = gradientCss(band);

    const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;
    const head = el("div", { class: "band-head" }, [
      swatch,
      el("div", { class: "band-headmeta" }, [
        el("div", { class: "band-title" }, [
          el("span", { class: "idx" }, [String(band.index + 1).padStart(2, "0")]),
          el("span", { class: "label" }, [band.label]),
          el("span", { class: "count" }, [`${band.members.length} members`]),
        ]),
        el("div", { class: "band-sub" }, [
          `score ${fmt(band.scoreMin)} … ${fmt(band.scoreMax)} · ${band.gradient.stops.length} stops · ${band.addedRules.length} added rule(s)`,
        ]),
      ]),
    ]);
    head.addEventListener("click", () => {
      if (this.open.has(band.index)) this.open.delete(band.index);
      else this.open.add(band.index);
      this.select(band.index);
    });
    wrap.append(head);

    const body = el("div", { class: "band-body" });

    // --- band label + score range ---
    body.append(el("div", { class: "subhead" }, ["Band position & width (score interval)"]));
    const labelInput = el("input", { type: "text", value: band.label });
    labelInput.addEventListener("change", () => {
      band.label = labelInput.value;
      this.store.markDirty();
      this.cb.onDirty();
      this.render();
    });
    const minInput = el("input", { type: "number", step: "0.001", value: String(band.scoreMin) });
    const maxInput = el("input", { type: "number", step: "0.001", value: String(band.scoreMax) });
    const onRange = () => {
      band.scoreMin = Number(minInput.value);
      band.scoreMax = Number(maxInput.value);
      this.store.reassignBands();
      this.store.markDirty();
      this.cb.onDirty();
      this.cb.onBandEdited(band.index);
      this.render();
    };
    minInput.addEventListener("change", onRange);
    maxInput.addEventListener("change", onRange);
    body.append(
      el("div", { class: "range-row" }, [
        el("span", { class: "band-sub" }, ["label"]),
        labelInput,
      ]),
      el("div", { class: "range-row" }, [
        el("span", { class: "band-sub" }, ["min"]),
        minInput,
        el("span", { class: "band-sub" }, ["max"]),
        maxInput,
      ])
    );

    // --- members ---
    body.append(el("div", { class: "subhead" }, ["Members (most → least beloved)"]));
    const members = el("div", { class: "members" });
    const scoreByName = new Map(cfg.animals.map((a) => [a.name, a.score]));
    for (const name of band.members) {
      members.append(
        el("span", { class: "member" }, [
          name,
          el("span", { class: "s" }, [` ${(scoreByName.get(name) ?? 0).toFixed(2)}`]),
        ])
      );
    }
    if (band.members.length === 0) members.append(el("span", { class: "band-sub" }, ["(empty band)"]));
    body.append(members);

    // --- gradient ---
    body.append(el("div", { class: "subhead" }, ["Background gradient (stops vary with density)"]));
    const bar = el("div", { class: "gradient-bar" });
    bar.style.background = gradientCss(band);
    body.append(bar);
    body.append(this.renderStops(band, bar, swatch));

    // --- traits ---
    body.append(el("div", { class: "subhead" }, ["Relationship words (primary)"]));
    body.append(this.renderChips(band.traits.relationship, false));
    body.append(el("div", { class: "subhead" }, ["Motion words (secondary cross-check)"]));
    body.append(this.renderChips(band.traits.motion, true));

    // --- rules ---
    body.append(el("div", { class: "subhead" }, ["Added rules (core three always on)"]));
    for (const rule of band.addedRules) body.append(this.renderRule(band, rule));
    body.append(this.renderRuleLibrary(band));

    wrap.append(body);
    return wrap;
  }

  private renderStops(band: Band, bar: HTMLElement, swatch: HTMLElement): HTMLElement {
    const container = el("div", { class: "stops" });
    const refresh = () => {
      const css = gradientCss(band);
      bar.style.background = css;
      swatch.style.background = css;
      this.store.markDirty();
      this.cb.onDirty();
      this.cb.onBandEdited(band.index);
    };
    band.gradient.stops.forEach((stop, i) => {
      const color = el("input", { type: "color", value: stop.hex });
      color.addEventListener("input", () => {
        stop.hex = color.value;
        stop.name = nearestColorName(stop.hex);
        nameLabel.textContent = stop.name;
        refresh();
      });
      const nameLabel = el("span", { class: "stopname" }, [stop.name]);
      const pos = el("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(stop.pos) });
      pos.addEventListener("input", () => {
        stop.pos = Number(pos.value);
        refresh();
      });
      const del = el("button", { class: "btn-text" }, ["remove"]);
      del.addEventListener("click", () => {
        band.gradient.stops.splice(i, 1);
        refresh();
        this.render();
      });
      container.append(el("div", { class: "stop" }, [color, nameLabel, pos, del]));
    });
    const add = el("button", { class: "btn-text" }, ["+ add stop"]);
    add.addEventListener("click", () => {
      band.gradient.stops.push({ name: "grey", hex: "#808080", pos: 0.5 });
      refresh();
      this.render();
    });
    container.append(add);
    return container;
  }

  private renderChips(list: string[], secondary: boolean): HTMLElement {
    const wrap = el("div", { class: "chips" });
    list.forEach((word, i) => {
      const x = el("span", { class: "x" }, ["×"]);
      x.addEventListener("click", () => {
        list.splice(i, 1);
        this.store.markDirty();
        this.cb.onDirty();
        this.render();
      });
      wrap.append(el("span", { class: `chip${secondary ? " secondary" : ""}` }, [word, x]));
    });
    const input = el("input", { type: "text", placeholder: "+ word" });
    input.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter" && input.value.trim()) {
        list.push(input.value.trim());
        this.store.markDirty();
        this.cb.onDirty();
        this.render();
      }
    });
    wrap.append(el("span", { class: "chip-add" }, [input]));
    return wrap;
  }

  private renderRule(band: Band, rule: SelectedRule): HTMLElement {
    const wrap = el("div", { class: "rule" });
    const remove = el("button", { class: "btn-text" }, ["remove"]);
    remove.addEventListener("click", () => {
      band.addedRules = band.addedRules.filter((r) => r.id !== rule.id);
      this.store.markDirty();
      this.cb.onDirty();
      this.cb.onBandEdited(band.index);
      this.render();
    });
    wrap.append(
      el("div", { class: "rule-head" }, [
        el("span", { class: "rname" }, [rule.name]),
        el("span", { class: "emergent" }, [`→ ${rule.emergent}`]),
        el("span", { class: "prox" }, [`prox ${rule.proximity.toFixed(3)}`]),
        remove,
      ])
    );

    const wLabel = el("span", { class: "band-sub" }, [`weight ${rule.weight.toFixed(2)}`]);
    const w = el("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(rule.weight) });
    w.addEventListener("input", () => {
      rule.weight = Number(w.value);
      wLabel.textContent = `weight ${rule.weight.toFixed(2)}`;
      this.store.markDirty();
      this.cb.onDirty();
      this.cb.onBandEdited(band.index);
    });
    wrap.append(el("div", { class: "rule-weight" }, [wLabel, w]));

    const params = el("div", { class: "rule-params" });
    for (const key of Object.keys(rule.params)) {
      const inp = el("input", { type: "number", step: "0.05", value: String(rule.params[key]) });
      inp.addEventListener("change", () => {
        rule.params[key] = Number(inp.value);
        this.store.markDirty();
        this.cb.onDirty();
        this.cb.onBandEdited(band.index);
      });
      params.append(el("div", { class: "param" }, [el("label", {}, [key]), inp]));
    }
    wrap.append(params);
    return wrap;
  }

  private renderRuleLibrary(band: Band): HTMLElement {
    const present = new Set(band.addedRules.map((r) => r.id));
    const wrap = el("div", { class: "rule-lib" });
    for (const lib of RULE_LIBRARY) {
      if (present.has(lib.id)) continue;
      const b = el("button", { class: "lib-add", title: lib.description }, [`+ ${lib.name}`]);
      b.addEventListener("click", () => {
        band.addedRules.push({
          id: lib.id,
          name: lib.name,
          emergent: lib.emergent,
          weight: 0.6,
          params: { ...lib.params },
          proximity: 0,
        });
        this.store.markDirty();
        this.cb.onDirty();
        this.cb.onBandEdited(band.index);
        this.render();
      });
      wrap.append(b);
    }
    return wrap;
  }
}

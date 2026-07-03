import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Band, BoidsConfig, ScoredAnimal } from "../shared/types.js";
import { loadCurationData } from "./data.js";
import { createProvider, Embedder } from "./embedding/index.js";
import { buildAxis } from "./axis.js";
import { scoreAnimals, defaultBandIntervals, assignBands } from "./bands.js";
import { buildGradient, stopsForDensity } from "./colors.js";
import { topByCosine } from "./traits.js";
import { selectRules } from "./rules.js";
import { meanVec, unit, subVec } from "../shared/vecmath.js";

const CONFIG_PATH = resolve(process.cwd(), "config.json");

// Load .env if present so OPENAI_API_KEY can live in a file (Node >= 20.12).
try {
  if (existsSync(resolve(process.cwd(), ".env"))) process.loadEnvFile();
} catch {
  /* optional */
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const force = args.has("--force");

  if (existsSync(CONFIG_PATH) && !force) {
    const existing = JSON.parse(await readFile(CONFIG_PATH, "utf8")) as BoidsConfig;
    if (existing.meta?.locked) {
      console.error(
        "config.json is locked (meta.locked = true). Refusing to overwrite.\n" +
          "Re-run with --force to regenerate and discard human edits."
      );
      process.exit(1);
    }
  }

  const data = await loadCurationData();
  const { settings } = data;
  console.log(
    `Loaded ${data.animals.length} animals, ${data.relationshipWords.length} relationship words, ` +
      `${data.motionWords.length} motion words, ${Object.keys(data.xkcdColors).length} xkcd colors, ` +
      `${data.rules.library.length} library rules.`
  );

  const provider = createProvider();
  const embedder = new Embedder(provider);

  // Everything that needs a vector, embedded once (and cached to disk).
  const colorNames = Object.keys(data.xkcdColors);
  const ruleTexts = data.rules.library.map((r) => r.embedText);
  const allTexts = [
    settings.endpoints.positiveWord,
    settings.endpoints.negativeWord,
    ...data.animals,
    ...data.relationshipWords,
    ...data.motionWords,
    ...ruleTexts,
    ...colorNames,
  ];
  const emb = await embedder.embedMany(allTexts);

  // Axis + scoring.
  const axis = buildAxis(settings.endpoints, emb);
  const scores = scoreAnimals(data.animals, emb, axis);
  const intervals = defaultBandIntervals(scores, settings.bands.count, settings.bands.rangePercentiles);
  assignBands(scores, intervals);

  // Rule embeddings keyed by rule id.
  const ruleEmbeddings = new Map<string, number[]>();
  for (const r of data.rules.library) {
    const v = emb.get(r.embedText);
    if (v) ruleEmbeddings.set(r.id, v);
  }
  // Color embeddings keyed by color name.
  const colorEmbeddings = new Map<string, number[]>();
  for (const name of colorNames) {
    const v = emb.get(name);
    if (v) colorEmbeddings.set(name, v);
  }

  // Endpoint vectors for the empty-band concept fallback.
  const posVec = emb.get(settings.endpoints.positiveWord)!;
  const negVec = emb.get(settings.endpoints.negativeWord)!;

  const membersByBand: string[][] = intervals.map(() => []);
  for (const a of scores.animals) membersByBand[a.band].push(a.name);
  const maxMembers = Math.max(1, ...membersByBand.map((m) => m.length));

  const bands: Band[] = intervals.map((iv) => {
    const members = membersByBand[iv.index];

    // Group concept = centroid of member embeddings; fall back to an axis-position
    // blend of the two endpoints for a sparse/empty band.
    const memberVecs = members.map((n) => emb.get(n)).filter(Boolean) as number[][];
    let concept: number[];
    if (memberVecs.length > 0) {
      concept = meanVec(memberVecs);
    } else {
      const t = settings.bands.count > 1 ? iv.index / (settings.bands.count - 1) : 0;
      concept = unit(subVec(posVec, negVec).map((_, i) => posVec[i] * (1 - t) + negVec[i] * t));
    }

    const stops = stopsForDensity(members.length, maxMembers, settings.gradient.minStops, settings.gradient.maxStops);
    const gradient = buildGradient(
      concept,
      colorEmbeddings,
      data.xkcdColors,
      stops,
      settings.gradient.candidatePool,
      settings.gradient.angle
    );

    const relationship = topByCosine(concept, data.relationshipWords, emb, settings.traits.relationshipPerGroup);
    const motion = topByCosine(concept, data.motionWords, emb, settings.traits.motionPerGroup);

    const addedRules = selectRules(relationship, motion, data.rules.library, ruleEmbeddings, emb, settings.rules);

    return {
      index: iv.index,
      label: settings.bands.labels[iv.index] ?? `Band ${iv.index}`,
      scoreMin: Number(iv.scoreMin.toFixed(6)),
      scoreMax: Number(iv.scoreMax.toFixed(6)),
      members,
      gradient,
      traits: {
        relationship: relationship.map((r) => r.word),
        motion: motion.map((m) => m.word),
      },
      addedRules,
    };
  });

  const animals: ScoredAnimal[] = scores.animals.map((a) => ({
    name: a.name,
    score: Number(a.score.toFixed(6)),
    band: a.band,
  }));

  const config: BoidsConfig = {
    meta: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      provider: provider.id,
      model: provider.model,
      seed: settings.seed,
      locked: false,
      animalCount: animals.length,
      notes:
        provider.id === "devstub"
          ? "Generated with the DEV STUB provider — ranking is NOT semantically meaningful. Re-run with OPENAI_API_KEY set."
          : undefined,
    },
    axis: settings.endpoints,
    core: settings.core,
    bands,
    animals,
  };

  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${CONFIG_PATH}`);
  for (const b of bands) {
    console.log(
      `  [${b.index}] ${b.label.padEnd(10)} ${String(b.members.length).padStart(3)} members, ` +
        `${b.gradient.stops.length} stops, rules: ${b.addedRules.map((r) => `${r.id}(${r.weight})`).join(", ") || "none"}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

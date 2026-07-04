// The curation pipeline — the heart of v1 (PROJECT_BRIEF §7).
//
//   axis = E(beloved) − E(reviled)          two endpoint words, nothing more
//   score = animal · unit axis              projection; cosine (unit vectors)
//   five bands from rough quintile cuts     editable, not fixed cut points
//   per band: gradient / traits / rules     all derived, all human-adjustable
//
// Embedding happens HERE and only here. The output, config.json, is the lock:
// the review UI edits it, the show reads it, nobody re-embeds at runtime.
//
//   npm run curate            refuses to overwrite a locked config
//   npm run curate -- --force overwrites anyway

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ANIMALS } from '../data/animals';
import { XKCD_COLORS } from '../data/colors';
import { RELATIONSHIP_WORDS, MOTION_WORDS } from '../data/lexicon';
import { RULE_LIBRARY } from './sim/rules';
import type { BoidsConfig, ScoredAnimal } from './config/schema';
import { membersFromCuts } from './config/schema';
import { dot, mean, normalize, sub } from './embed/provider';
import { loadDotEnv, makeProvider } from './curate/env';
import { deriveGroup, quintileCuts, type Emb } from './curate/derive';

const CWD = process.cwd();
const OUT = resolve(CWD, 'config.json');

async function main(): Promise<void> {
  await loadDotEnv(CWD);
  const AXIS_POSITIVE = process.env.AXIS_POSITIVE || 'beloved';
  const AXIS_NEGATIVE = process.env.AXIS_NEGATIVE || 'reviled';

  // Respect the lock.
  const force = process.argv.includes('--force');
  try {
    const existing = JSON.parse(await readFile(OUT, 'utf8')) as BoidsConfig;
    if (existing.locked && !force) {
      console.error('config.json is LOCKED. Unlock it in the review UI or pass --force.');
      process.exit(1);
    }
  } catch {
    /* no existing config */
  }

  const provider = makeProvider(CWD);
  console.log(`Boids curation — ${provider.name} / ${provider.model}`);
  console.log(`axis: ${AXIS_POSITIVE} → ${AXIS_NEGATIVE}\n`);

  // One deduplicated vocabulary; every string embedded exactly once, cached on disk.
  const animals = [...new Set(ANIMALS)];
  if (animals.length !== ANIMALS.length)
    console.log(`  (deduplicated ${ANIMALS.length - animals.length} repeated names)`);
  const colorNames = XKCD_COLORS.map((c) => c.name);
  const ruleTexts = RULE_LIBRARY.map((r) => r.description);
  const vocab = [
    AXIS_POSITIVE,
    AXIS_NEGATIVE,
    ...animals,
    ...RELATIONSHIP_WORDS,
    ...MOTION_WORDS,
    ...ruleTexts,
    ...colorNames,
  ];
  process.stdout.write(`embedding ${vocab.length} strings … `);
  const t0 = Date.now();
  const vectors = await provider.embed(vocab);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  const emb: Emb = new Map(vocab.map((t, i) => [t, vectors[i]]));
  const ruleEmb = new Map(RULE_LIBRARY.map((r, i) => [r.id, emb.get(ruleTexts[i])!]));
  const colorEmb = colorNames.map((n) => emb.get(n)!);

  // The axis: one direction from two endpoint words. No basket, no "human".
  const axis = normalize(sub(emb.get(AXIS_POSITIVE)!, emb.get(AXIS_NEGATIVE)!));

  const scored: ScoredAnimal[] = animals
    .map((name) => ({
      name,
      score: Math.round(dot(emb.get(name)!, axis) * 10000) / 10000,
    }))
    .sort((a, b) => b.score - a.score);

  const cuts = quintileCuts(scored);
  const bands = membersFromCuts(scored, cuts);
  const maxMembers = Math.max(...bands.map((b) => b.length));
  const globalCentroid = mean(animals.map((a) => emb.get(a)!));

  const groups = bands.map((members, i) =>
    deriveGroup(
      i, members, maxMembers, globalCentroid, emb,
      XKCD_COLORS, colorEmb,
      RELATIONSHIP_WORDS, MOTION_WORDS, ruleEmb,
    ),
  );

  const config: BoidsConfig = {
    version: 1,
    generatedAt: new Date().toISOString(),
    locked: false,
    embedding: { provider: provider.name, model: provider.model, dim: provider.dim },
    axis: { positive: AXIS_POSITIVE, negative: AXIS_NEGATIVE },
    animals: scored,
    bandCuts: cuts,
    groups,
  };
  await writeFile(OUT, JSON.stringify(config, null, 2) + '\n');

  // ---- report ----
  const fmt = (s: ScoredAnimal) => `  ${s.score.toFixed(4).padStart(8)}  ${s.name}`;
  console.log('most beloved');
  scored.slice(0, 8).forEach((s) => console.log(fmt(s)));
  console.log('  …');
  scored.slice(-8).forEach((s) => console.log(fmt(s)));
  console.log('\nbands');
  for (const g of groups) {
    console.log(
      `  ${g.label.padEnd(3)} ${String(g.members.length).padStart(3)} members · ` +
        `${g.gradient.length} gradient stops · rules: ${g.rules.map((r) => `${r.id} ${r.weight}`).join(', ')}`,
    );
    console.log(
      `      ${g.members[0]} … ${g.members[g.members.length - 1]}\n` +
        `      traits: ${g.traits.relationship.map((t) => t.word).join(', ')} / ${g.traits.motion.map((t) => t.word).join(', ')}\n` +
        `      colors: ${g.gradient.map((s) => s.name).join(' → ')}`,
    );
  }
  console.log(`\nwrote config.json (${scored.length} animals). Review UI: npm run dev`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

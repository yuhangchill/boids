import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CoreParams, Endpoints } from "../shared/types.js";

const ROOT = process.cwd();

async function readLines(rel: string): Promise<string[]> {
  const raw = await readFile(resolve(ROOT, rel), "utf8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

async function readJson<T>(rel: string): Promise<T> {
  return JSON.parse(await readFile(resolve(ROOT, rel), "utf8")) as T;
}

export interface RuleDef {
  id: string;
  name: string;
  emergent: string;
  description: string;
  embedText: string;
  params: Record<string, number>;
}

export interface RuleLibrary {
  core: { id: string; name: string; description: string }[];
  library: RuleDef[];
}

export interface CurationSettings {
  endpoints: Endpoints;
  seed: number;
  bands: { count: number; labels: string[]; rangePercentiles: [number, number] };
  gradient: { minStops: number; maxStops: number; angle: number; candidatePool: number };
  traits: { relationshipPerGroup: number; motionPerGroup: number };
  rules: { maxPerGroup: number; minProximity: number; minWeight: number };
  core: CoreParams;
}

export interface CurationData {
  animals: string[];
  relationshipWords: string[];
  motionWords: string[];
  xkcdColors: Record<string, string>;
  rules: RuleLibrary;
  settings: CurationSettings;
}

export async function loadCurationData(): Promise<CurationData> {
  const [animals, relationshipWords, motionWords, xkcdColors, rules, settings] = await Promise.all([
    readLines("data/animals.txt"),
    readLines("data/lexicons/relationship-words.txt"),
    readLines("data/lexicons/motion-words.txt"),
    readJson<Record<string, string>>("data/xkcd-colors.json"),
    readJson<RuleLibrary>("data/rules.json"),
    readJson<CurationSettings>("data/curation.settings.json"),
  ]);
  return { animals, relationshipWords, motionWords, xkcdColors, rules, settings };
}

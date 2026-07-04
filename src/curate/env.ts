// Minimal .env loader + provider factory (node-only). No dotenv dependency
// for four lines of parsing. Key stays in env; never logged.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EmbeddingProvider } from '../embed/provider';
import { OpenAIProvider } from '../embed/openai';
import { DevStubProvider } from '../embed/devstub';
import { CachedProvider } from '../embed/cache';

export async function loadDotEnv(cwd: string): Promise<void> {
  let txt = '';
  try {
    txt = await readFile(resolve(cwd, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function makeProvider(cwd: string): EmbeddingProvider {
  const key = process.env.OPENAI_API_KEY;
  const forced = process.env.EMBEDDING_PROVIDER;
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';
  const cacheRoot = resolve(cwd, '.cache', 'embeddings');

  if (forced === 'devstub' || (!key && forced !== 'openai')) {
    console.warn(
      '\n  ⚠ no OPENAI_API_KEY — using the deterministic devstub.' +
        '\n    Plumbing only: stub rankings are NOT meaningful.\n',
    );
    return new CachedProvider(new DevStubProvider(), cacheRoot);
  }
  if (!key) throw new Error('EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is empty.');
  return new CachedProvider(new OpenAIProvider(key, model), cacheRoot);
}

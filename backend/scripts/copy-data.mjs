// Копирует локальные JSON-каталоги в dist/data, чтобы продакшен-сборка
// (node dist/server.js) не зависела от наличия исходников src/data.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'dist', 'data');
mkdirSync(outDir, { recursive: true });

for (const name of ['movies.json', 'food.json']) {
  const source = resolve(here, '..', 'src', 'data', name);
  const target = resolve(outDir, name);
  copyFileSync(source, target);
  console.log(`copied data/${name} -> dist/data/${name}`);
}

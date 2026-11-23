// Cloudflare Pages ожидает каталог dist в корне репозитория.
// Собираем frontend в frontend/dist и кладём готовую статику в корневой dist.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('frontend', 'dist');
const target = resolve('dist');

if (!existsSync(source)) {
  console.error(`[collect-dist] Не найден ${source}. Сначала соберите frontend.`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log('[collect-dist] frontend/dist -> dist');

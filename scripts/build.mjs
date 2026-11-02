/**
 * Крос-платформна збірка: спершу перевірка даних, потім Astro.
 * --allow-placeholders дозволяє попередній перегляд із вигаданими даними.
 */
import { spawnSync } from 'node:child_process';

const allow = process.argv.includes('--allow-placeholders');
const env = { ...process.env, BREWMUG_ALLOW_PLACEHOLDERS: allow ? '1' : '0' };

const check = spawnSync(process.execPath, ['scripts/check-placeholders.mjs'], { stdio: 'inherit', env });
if (check.status !== 0) process.exit(check.status ?? 1);

const astroBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const prep = spawnSync(process.execPath, ['scripts/prepare-assets.mjs'], { stdio: 'inherit', env });
if (prep.status !== 0) process.exit(prep.status ?? 1);

const build = spawnSync(astroBin, ['astro', 'build'], { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(build.status ?? 1);

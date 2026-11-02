/**
 * Копіює SVG-ілюстрації в public/illo/, щоб віддавати їх через <img src="/illo/name.svg">.
 * Файли дрібні (0.5-1.5 КБ), кешуються браузером і не збільшують HTML.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(root, 'src', 'assets', 'illo');
const to = join(root, 'public', 'illo');

if (existsSync(to)) rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });

let n = 0;
for (const f of readdirSync(from).filter((f) => f.endsWith('.svg'))) {
  copyFileSync(join(from, f), join(to, f));
  n++;
}
console.log(`✓ ${n} ілюстрацій скопійовано в public/illo/`);
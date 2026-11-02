/**
 * Блокує production-збірку, якщо в даних лишилися заглушки (placeholder: true).
 * Локальна/попередня збірка дозволена через BREWMUG_ALLOW_PLACEHOLDERS=1.
 */
import { loadData } from './load-data.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const allow = process.env.BREWMUG_ALLOW_PLACEHOLDERS === '1';

let loaded;
try {
  loaded = loadData(decodeURIComponent(root));
} catch (e) {
  console.error('✗ Дані невалідні:\n' + e.message);
  process.exit(1);
}

const total = loaded.menu.reduce((n, c) => n + c.items.length, 0);
console.log(`✓ Дані валідні: ${loaded.menu.length} категорії, ${total} позицій`);

if (loaded.placeholders.length) {
  const list = loaded.placeholders.map((p) => `  • ${p}`).join('\n');
  if (allow) {
    console.warn(`⚠ Знайдено ${loaded.placeholders.length} заглушок (дозволено для превʼю):\n${list}`);
  } else {
    console.error(
      `✗ У даних ${loaded.placeholders.length} заглушок — публікувати не можна (BR 004, чесність контенту):\n${list}\n` +
        'Замініть на справжні дані або запустіть npm run build:preview для попереднього перегляду.',
    );
    process.exit(1);
  }
}

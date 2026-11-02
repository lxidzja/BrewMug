/**
 * Перевірка правил зберігання персональних даних (BR 004).
 * У березні «перевіряє» чистку 90-денних записів — для цього є dry-run і --purge.
 *
 *   node scripts/prune.mjs            показати, скільки записів старші за строк
 *   node scripts/prune.mjs --purge    видалити їх
 *   node scripts/stats.mjs            статистика заявок за місяць (ціль BR: ≥20/місяць)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const root = process.cwd();
const dbPath = join(root, '.local', 'db.json');
const site = parse(readFileSync(join(root, 'src', 'data', 'site.yaml'), 'utf8'));
const retention = site.privacy?.retentionDays ?? 90;
const purge = process.argv.includes('--purge');

if (!existsSync(dbPath)) {
  console.log('Локальної бази немає (.local/db.json) — на D1 чистку виконує cron-задача Functions.');
  process.exit(0);
}

const db = JSON.parse(readFileSync(dbPath, 'utf8'));
const cutoff = new Date(Date.now() - retention * 86_400_000).toISOString();
const staleBookings = db.bookings.filter((b) => b.createdAt < cutoff);
const staleContacts = db.contacts.filter((c) => c.createdAt < cutoff);
console.log(`Строк зберігання: ${retention} днів, поріг: ${cutoff}`);
console.log(`Старіші за строк: заявок ${staleBookings.length}, звернень ${staleContacts.length}`);

if (purge) {
  db.bookings = db.bookings.filter((b) => b.createdAt >= cutoff);
  db.contacts = db.contacts.filter((c) => c.createdAt >= cutoff);
  writeFileSync(dbPath, JSON.stringify(db, null, 1), 'utf8');
  console.log('✓ видалено');
} else if (staleBookings.length || staleContacts.length) {
  console.log('Запустіть з --purge, щоб видалити.');
}

/**
 * Статистика заявок за місяць — метрика BR «≥20 бронювань/звернень на місяць».
 * Читає локальну базу .local/db.json (для D1 — аналогічний SQL у воркері).
 *   node scripts/stats.mjs [YYYY-MM]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.local', 'db.json');
if (!existsSync(dbPath)) {
  console.log('Локальної бази немає (.local/db.json). На продакшені — запит до D1:');
  console.log("  SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) FROM bookings GROUP BY m;");
  process.exit(0);
}

const db = JSON.parse(readFileSync(dbPath, 'utf8'));
const month = process.argv[2]; // 'YYYY-MM'
const inMonth = (iso) => (month ? iso.slice(0, 7) === month : true);

const bookings = db.bookings.filter((b) => inMonth(b.createdAt));
const contacts = db.contacts.filter((c) => inMonth(c.createdAt));
const total = bookings.length + contacts.length;

console.log(`Місяць: ${month ?? 'усі'} — бронювань: ${bookings.length}, звернень: ${contacts.length}`);
console.log(`Разом заявок: ${total} (ціль: ≥ 20) — ${total >= 20 ? '✓ досягнуто' : 'ще ні'}`);

const byStatus = bookings.reduce((acc, b) => ({ ...acc, [b.status]: (acc[b.status] ?? 0) + 1 }), {});
console.log('За статусами:', JSON.stringify(byStatus));
const guests = bookings.reduce((n, b) => n + b.guests, 0);
console.log('Гостей у заявках:', guests);

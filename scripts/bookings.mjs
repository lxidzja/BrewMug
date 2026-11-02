/**
 * Перегляд заявок у локальній базі — для демонстрації на захисті.
 * (Аналог UC7 «Переглянути звернення та бронювання»: у продакшені це робить
 *  адміністратор через Telegram, тут — консольна команда.)
 *
 *   npm run bookings              останні 20 заявок і звернень
 *   npm run bookings -- --all     усі
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.local', 'db.json');
if (!existsSync(dbPath)) {
  console.log('Заявок ще немає. Запустіть сайт (npm run server:dev) і надішліть форму.');
  process.exit(0);
}

const db = JSON.parse(readFileSync(dbPath, 'utf8'));
const all = process.argv.includes('--all');
const limit = all ? db.bookings.length : 20;

const fmt = (iso) => new Date(iso).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
const pad = (s, n) => String(s).padEnd(n).slice(0, n);

console.log(`\nЗАЯВКИ НА СТОЛИК (${db.bookings.length}):`);
console.log(pad('створено', 18) + pad('імʼя', 22) + pad('телефон', 16) + pad('дата', 12) + pad('час', 7) + pad('гост.', 6) + 'статус');
console.log('-'.repeat(88));
for (const b of db.bookings.slice(-limit).reverse()) {
  console.log(
    pad(fmt(b.createdAt), 18) +
      pad(b.name, 22) +
      pad(b.phone, 16) +
      pad(b.date, 12) +
      pad(b.time, 7) +
      pad(b.guests, 6) +
      b.status,
  );
}

const contacts = db.contacts.slice(-limit).reverse();
if (contacts.length) {
  console.log(`\nЗВЕРНЕННЯ (${db.contacts.length}):`);
  for (const c of contacts) {
    console.log(`${fmt(c.createdAt)}  ${c.name}${c.phone ? ' · ' + c.phone : ''}`);
    console.log('   ' + String(c.message).replace(/\n/g, ' ').slice(0, 120));
  }
}
console.log('');

/**
 * Спільні схеми форм. Використовуються і на сервері (обов'язково),
 * і в браузері (для швидкої підказки). Сервер завжди перевіряє сам.
 */
import { z } from 'zod';

/** Нормалізує телефон до +380XXXXXXXXX. Приймає +380…, 380…, 0XX…, з пробілами/дужками/дефісами. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  let d = digits.replace(/^\+/, '');
  if (d.startsWith('380') && d.length === 12) return '+' + d;
  if (d.startsWith('80') && d.length === 11) return '+3' + d;
  if (d.startsWith('0') && d.length === 10) return '+38' + d;
  return null;
}

/** Перевірка імені без регекс-літер: дозволені будь-які літери Unicode, апострофи, дефіс, пробіл. */
export function isValidName(value: string): boolean {
  const allowedPunct = new Set([' ', '-', '.', "'", '’', 'ʼ', "`"]);
  for (const ch of value) {
    if (allowedPunct.has(ch)) continue;
    const cp = ch.codePointAt(0) ?? 0;
    // літери всіх мов включно з сурогатними парами; марки (Mn/Mc) — діакритика
    const isLetter = /^[\p{L}\p{M}]$/u.test(ch);
    if (!isLetter) return false;
  }
  return true;
}

const phoneField = z
  .string()
  .min(1, 'Вкажіть телефон')
  .transform((v) => normalizePhone(v))
  .refine((v): v is string => v !== null, { message: 'Телефон у форматі +380 XX XXX XX XX' });

const nameField = z
  .string()
  .trim()
  .min(2, 'Імʼя — щонайменше 2 символи')
  .max(60, 'Імʼя надто довге')
  .refine((v) => isValidName(v), { message: 'В імені можуть бути літери, апостроф, дефіс і пробіл' });

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const bookingSchema = z.object({
  name: nameField,
  phone: phoneField,
  date: z.string().regex(DATE_RE, 'Оберіть дату'),
  time: z.string().regex(TIME_RE, 'Оберіть час'),
  guests: z.coerce.number().int().min(1, 'Щонайменше 1 гість').max(50, 'Забагато гостей'),
  wishes: z.string().trim().max(300, 'Не більше 300 символів').optional().default(''),
  // анти-спам
  company: z.string().max(0, 'Помилка').optional().default(''), // honeypot — має бути порожнім
  ts: z.coerce.number().optional().default(0),
  slug: z.string().max(64).optional().default(''),
});

export type BookingInput = z.input<typeof bookingSchema>;
export type BookingData = z.output<typeof bookingSchema>;

export const contactSchema = z.object({
  name: nameField,
  phone: z.union([phoneField, z.literal('')]).optional().default(''),
  message: z
    .string()
    .trim()
    .min(10, 'Опишіть питання — щонайменше 10 символів')
    .max(1000, 'Не більше 1000 символів'),
  company: z.string().max(0, 'Помилка').optional().default(''),
  ts: z.coerce.number().optional().default(0),
});

export type ContactData = z.output<typeof contactSchema>;

/** Перетворює ZodError у мапу поле → текст помилки. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Форматування ціни та дати українською. */
export const fmtPrice = (n: number) => `${new Intl.NumberFormat('uk-UA').format(n)} грн`;

export function fmtDateUk(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(dt);
}

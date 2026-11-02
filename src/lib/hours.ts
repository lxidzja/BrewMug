/**
 * Логіка годин роботи. Час рахується в часовому поясі кав'ярні (Europe/Kyiv),
 * незалежно від поясу відвідувача.
 *
 * Правила:
 *  - days: 0=неділя … 6=субота
 *  - close "HH:MM" може бути більшим за 24:00 — закриття після півночі ("26:00" = 02:00)
 *  - closures-дата робить день повністю зачиненим
 */
import type { HoursRule } from './types';

export interface OpenState {
  open: boolean;
  /** Наступна зміна стану (мс), якщо відомо */
  changesAt: number | null;
}

const MIN = 60_000;

/** Поточні дата/час у заданому поясі. */
export function nowInZone(now: Date, timeZone: string): { y: number; m: number; d: number; hh: number; mm: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hh: Number(parts.hour === '24' ? '0' : parts.hour),
    mm: Number(parts.minute),
  };
}

/** ISO-дата (YYYY-MM-DD) у поясі. */
export function isoDateInZone(now: Date, timeZone: string): string {
  const { y, m, d } = nowInZone(now, timeZone);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Минути від півночі для "HH:MM" (допускає >24). */
export function toMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) throw new Error(`Некоректний час: ${hhmm}`);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Субота/неділя для вказаного ISO-дня (обчислюється в UTC, бо це лише календар). */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** Зсув попереднього дня. */
export function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days));
  return dt.toISOString().slice(0, 10);
}

export interface DayHours {
  /** ISO-дата */
  date: string;
  /** Інтервал у хвилинах від півночі цього дня; close може бути > 1440 */
  ranges: { open: number; close: number }[];
}

/** Години роботи конкретного дня з урахуванням правил попереднього дня (закриття після півночі). */
export function dayHours(
  isoDate: string,
  hours: HoursRule[],
  closures: { date: string; reason: string }[],
): DayHours {
  if (closures.some((c) => c.date === isoDate)) return { date: isoDate, ranges: [] };
  const ranges: { open: number; close: number }[] = [];

  // інтервали, що почалися цього дня
  const wd = weekdayOf(isoDate);
  for (const rule of hours) {
    if (!rule.days.includes(wd)) continue;
    const open = toMinutes(rule.open);
    let close = toMinutes(rule.close);
    if (close <= open) close += 1440;
    ranges.push({ open, close });
  }

  // інтервал попереднього дня, який триває після півночі
  const prev = shiftDate(isoDate, -1);
  if (!closures.some((c) => c.date === prev)) {
    const prevWd = weekdayOf(prev);
    for (const rule of hours) {
      if (!rule.days.includes(prevWd)) continue;
      const open = toMinutes(rule.open);
      let close = toMinutes(rule.close);
      if (close <= open) close += 1440;
      if (close > 1440) ranges.push({ open: 0, close: close - 1440 });
    }
  }

  ranges.sort((a, b) => a.open - b.open);
  // об'єднуємо перетин
  const merged: { open: number; close: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.open <= last.close) last.close = Math.max(last.close, r.close);
    else merged.push({ ...r });
  }
  return { date: isoDate, ranges: merged };
}

/**
 * Чи відчинено зараз і коли наступна зміна стану.
 * Враховує інтервали, що почалися вчора й тривають після півночі.
 */
export function openState(
  now: Date,
  timeZone: string,
  hours: HoursRule[],
  closures: { date: string; reason: string }[],
): OpenState {
  const { hh, mm } = nowInZone(now, timeZone);
  const today = isoDateInZone(now, timeZone);
  const minutes = hh * 60 + mm;

  const todayHours = dayHours(today, hours, closures);
  for (const r of todayHours.ranges) {
    if (minutes >= r.open && minutes < r.close) {
      const changesAt = startOfLocalDay(now, timeZone) + r.close * MIN;
      return { open: true, changesAt };
    }
  }
  // закрито: шукаємо найближче відкриття сьогодні або в наступні 14 днів
  const dayStart = startOfLocalDay(now, timeZone);
  for (let i = 0; i < 14; i++) {
    const date = shiftDate(today, i);
    const dh = dayHours(date, hours, closures);
    for (const r of dh.ranges) {
      const startMin = r.open + i * 1440;
      if (startMin > minutes) return { open: false, changesAt: dayStart + startMin * MIN };
    }
  }
  return { open: false, changesAt: null };
}

/** Початок доби (у стені поясу) як абсолютний момент у мс. */
function startOfLocalDay(now: Date, timeZone: string): number {
  const { hh, mm } = nowInZone(now, timeZone);
  return now.getTime() - (hh * 60 + mm) * MIN;
}

/** Час у людському вигляді «до 22:00» / «о 8:00» для поточного дня. */
export function describeChange(now: Date, timeZone: string, state: OpenState): string {
  if (state.changesAt === null) return '';
  const t = nowInZone(new Date(state.changesAt), timeZone);
  const hhmm = `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}`;
  return state.open ? `до ${hhmm}` : `о ${hhmm}`;
}

/** Чи день повністю зачинений (вихідний). */
export function isClosedDay(isoDate: string, hours: HoursRule[], closures: { date: string; reason: string }[]) {
  return dayHours(isoDate, hours, closures).ranges.length === 0;
}

/** Слоти замовлення на дату з кроком. */
export function slotsFor(
  isoDate: string,
  hours: HoursRule[],
  closures: { date: string; reason: string }[],
  stepMinutes: number,
): string[] {
  const dh = dayHours(isoDate, hours, closures);
  const out: string[] = [];
  for (const r of dh.ranges) {
    // останній слот — не пізніше ніж за 60 хв до закриття (щоб встигнути)
    for (let t = Math.ceil(r.open / stepMinutes) * stepMinutes; t + 60 <= r.close; t += stepMinutes) {
      if (t >= 1440) continue;
      out.push(fromMinutes(t));
    }
  }
  return [...new Set(out)];
}

/** Назви днів українською (0 = неділя). */
export const WEEKDAYS_UK = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
/** Порядок тижня з понеділка. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

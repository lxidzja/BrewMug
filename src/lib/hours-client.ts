/**
 * Клієнтська версія розрахунку годин (без залежностей і Node-API).
 * Дублює логіку src/lib/hours.ts, але модуль малий і не тягне серверний код у бандл.
 */
import type { HoursRule } from './types';

export const WEEKDAY_LABEL = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];

const MIN = 60_000;

export function nowInZone(now: Date, timeZone: string) {
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

export function isoDateInZone(now: Date, timeZone: string): string {
  const { y, m, d } = nowInZone(now, timeZone);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
};
export const fromMinutes = (total: number) =>
  `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

export const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
};

export const shiftDate = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
};

export function dayRanges(iso: string, hours: HoursRule[], closures: { date: string }[]) {
  if (closures.some((c) => c.date === iso)) return [];
  const ranges: { open: number; close: number }[] = [];
  const wd = weekdayOf(iso);
  for (const r of hours) {
    if (!r.days.includes(wd)) continue;
    const open = toMinutes(r.open);
    let close = toMinutes(r.close);
    if (close <= open) close += 1440;
    ranges.push({ open, close });
  }
  return ranges;
}

export function openState(now: Date, timeZone: string, hours: HoursRule[], closures: { date: string; reason: string }[]) {
  const { hh, mm } = nowInZone(now, timeZone);
  const today = isoDateInZone(now, timeZone);
  const minutes = hh * 60 + mm;
  const dayStart = now.getTime() - minutes * MIN;

  for (const r of dayRanges(today, hours, closures)) {
    if (minutes >= r.open && minutes < r.close) return { open: true, changesAt: dayStart + r.close * MIN };
  }
  for (let i = 0; i < 14; i++) {
    const date = shiftDate(today, i);
    for (const r of dayRanges(date, hours, closures)) {
      const start = r.open + i * 1440;
      if (start > minutes) return { open: false, changesAt: dayStart + start * MIN };
    }
  }
  return { open: false, changesAt: null as number | null };
}

export function describeChange(now: Date, timeZone: string, state: { open: boolean; changesAt: number | null }) {
  if (state.changesAt === null) return '';
  const t = nowInZone(new Date(state.changesAt), timeZone);
  const hhmm = `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}`;
  return state.open ? `до ${hhmm}` : `о ${hhmm}`;
}

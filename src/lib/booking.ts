/**
 * Доступні слоти для конкретної дати з урахуванням мінімального запасу часу.
 * Чистий модуль: використовується і на сервері, і (для підказки) у браузері.
 */
import { slotsFor, toMinutes, weekdayOf } from './hours';
import type { HoursRule } from './types';

export interface BookingConfig {
  minLeadMinutes: number;
  horizonDays: number;
  slotStepMinutes: number;
  maxGuests: number;
  capacityPerSlot: number;
  holdMinutes: number;
}

export interface Slot {
  time: string;
  available: boolean;
  reason: 'ok' | 'past' | 'full' | 'closed';
}

/** ISO-дата найближчого дня, починаючи з today, що має хоч один вільний слот. */
export function firstBookableDate(
  todayIso: string,
  hours: HoursRule[],
  closures: { date: string; reason: string }[],
  cfg: BookingConfig,
  now: Date,
  timeZone: string,
): string {
  for (let i = 0; i <= cfg.horizonDays; i++) {
    const iso = addDays(todayIso, i);
    const slots = slotsFor(iso, hours, closures, cfg.slotStepMinutes);
    if (slots.some((s) => isSlotInFuture(iso, s, now, timeZone, cfg.minLeadMinutes))) return iso;
  }
  return todayIso;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** Чи час ще придатний для заявки (запас minLeadMinutes). */
export function isSlotInFuture(iso: string, time: string, now: Date, timeZone: string, lead: number): boolean {
  const nowLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => nowLocal.find((p) => p.type === t)?.value ?? '0';
  const todayIso = `${get('year')}-${get('month')}-${get('day')}`;
  const nowMin = Number(get('hour') === '24' ? 0 : get('hour')) * 60 + Number(get('minute'));
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = todayIso.split('-').map(Number);
  // Явні аргументи: spread масиву в Date.UTC згубив би перше число в IE-подібних рушіях і плутав типи
  const dayDiff = Math.round((Date.UTC(y!, m! - 1, d!) - Date.UTC(ty!, tm! - 1, td!)) / 86_400_000);
  if (dayDiff > 0) return true;
  if (dayDiff < 0) return false;
  return toMinutes(time) >= nowMin + lead;
}

export function slotsWithAvailability(
  iso: string,
  hours: HoursRule[],
  closures: { date: string; reason: string }[],
  cfg: BookingConfig,
  now: Date,
  timeZone: string,
  takenByTime: Record<string, number>,
): Slot[] {
  return slotsFor(iso, hours, closures, cfg.slotStepMinutes).map((time) => {
    if (!isSlotInFuture(iso, time, now, timeZone, cfg.minLeadMinutes)) return { time, available: false, reason: 'past' };
    const taken = takenByTime[time] ?? 0;
    if (taken + 1 > cfg.capacityPerSlot) return { time, available: false, reason: 'full' };
    return { time, available: true, reason: 'ok' };
  });
}

export function isWithinHorizon(iso: string, todayIso: string, horizonDays: number): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const [y2, m2, d2] = todayIso.split('-').map(Number);
  const diff = Math.round((Date.UTC(y!, m! - 1, d!) - Date.UTC(y2!, m2! - 1, d2!)) / 86_400_000);
  return diff >= 0 && diff <= horizonDays;
}

export { weekdayOf };

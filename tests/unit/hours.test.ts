import { describe, expect, it } from 'vitest';
import {
  dayHours,
  isoDateInZone,
  openState,
  slotsFor,
  describeChange,
  toMinutes,
  weekdayOf,
  WEEK_ORDER,
} from '@/lib/hours';
import type { HoursRule } from '@/lib/types';

const TZ = 'Europe/Kyiv';
const HOURS: HoursRule[] = [
  { days: [1, 2, 3, 4], open: '08:00', close: '22:00' },
  { days: [5], open: '08:00', close: '23:00' },
  { days: [6], open: '09:00', close: '23:00' },
  { days: [0], open: '09:00', close: '21:00' },
];
const NO_CLOSURES: { date: string; reason: string }[] = [];

/** ISO-момент для (дата, час) у Києві. Київ: UTC+2 взимку, UTC+3 влітку. */
function kyiv(dateTime: string): Date {
  return new Date(dateTime + 'Z');
}

describe('години роботи', () => {
  it('відчиняє рівно о відкритті й зачиняє о закритті', () => {
    // 2026-11-02 — понеділок, зима (UTC+2): 08:00 Kyiv = 06:00Z
    expect(openState(kyiv('2026-11-02T05:59:00'), TZ, HOURS, NO_CLOSURES).open).toBe(false);
    expect(openState(kyiv('2026-11-02T06:00:00'), TZ, HOURS, NO_CLOSURES).open).toBe(true);
    expect(openState(kyiv('2026-11-02T19:59:00'), TZ, HOURS, NO_CLOSURES).open).toBe(true); // 21:59
    expect(openState(kyiv('2026-11-02T20:00:00'), TZ, HOURS, NO_CLOSURES).open).toBe(false); // 22:00
  });

  it('відрізняє робочі дні з різними годинами (пʼятниця до 23:00)', () => {
    // пʼятниця 2026-11-06
    expect(weekdayOf('2026-11-06')).toBe(5);
    expect(openState(kyiv('2026-11-06T20:30:00'), TZ, HOURS, NO_CLOSURES).open).toBe(true); // 22:30
    // субота 2026-11-07 відкривається о 09:00
    expect(openState(kyiv('2026-11-07T06:00:00'), TZ, HOURS, NO_CLOSURES).open).toBe(false); // 08:00
    expect(openState(kyiv('2026-11-07T07:00:00'), TZ, HOURS, NO_CLOSURES).open).toBe(true); // 09:00
  });

  it('працює з перевитратою на літній/зимовий час', () => {
    // Літній час: 2026-07-01, UTC+3. 08:00 Kyiv = 05:00Z
    expect(openState(new Date('2026-07-01T05:00:00Z'), TZ, HOURS, NO_CLOSURES).open).toBe(true);
    expect(openState(new Date('2026-07-01T04:59:00Z'), TZ, HOURS, NO_CLOSURES).open).toBe(false);
    // Перехід 25.10.2026 (неділя): +3 → +2 о 04:00 Kyiv
    expect(isoDateInZone(new Date('2026-10-25T00:30:00Z'), TZ)).toBe('2026-10-25');
  });

  it('закриття після півночі', () => {
    const late: HoursRule[] = [{ days: [5], open: '20:00', close: '26:00' }];
    // пʼятниця 2026-11-06, Kyiv UTC+2: 22:30Z → 00:30 сб, 23:59Z → 01:59 сб, 00:01Z → 02:01 сб
    expect(openState(kyiv('2026-11-06T22:30:00'), TZ, late, NO_CLOSURES).open).toBe(true);
    expect(openState(kyiv('2026-11-06T23:59:00'), TZ, late, NO_CLOSURES).open).toBe(true);
    expect(openState(kyiv('2026-11-07T00:01:00'), TZ, late, NO_CLOSURES).open).toBe(false);
    const dh = dayHours('2026-11-07', late, NO_CLOSURES);
    expect(dh.ranges).toEqual([{ open: 0, close: 120 }]);
  });

  it('виняток-вихідний повністю зачиняє день', () => {
    const closures = [{ date: '2026-11-02', reason: 'ремонт' }];
    expect(dayHours('2026-11-02', HOURS, closures).ranges).toEqual([]);
    expect(openState(kyiv('2026-11-02T10:00:00'), TZ, HOURS, closures).open).toBe(false);
  });

  it('коли зачинено — повідомляє, коли відчиняться', () => {
    const st = openState(kyiv('2026-11-02T21:00:00'), TZ, HOURS, NO_CLOSURES); // 23:00 понеділка? ні, 21:00+2=23:00 → закрито
    expect(st.open).toBe(false);
    expect(describeChange(kyiv('2026-11-02T21:00:00'), TZ, st)).toBe('о 08:00');
  });

  it('кожен день тижня представлений у списку годин', () => {
    const days = new Set(HOURS.flatMap((h) => h.days));
    expect([...WEEK_ORDER].every((d) => days.has(d))).toBe(true);
  });
});

describe('слоти бронювання', () => {
  it('пропонує слоти в межах годин і з відступом від закриття', () => {
    const slots = slotsFor('2026-11-02', HOURS, NO_CLOSURES, 30);
    expect(slots[0]).toBe('08:00');
    expect(slots.at(-1)).toBe('21:00'); // останній слот + 60 хв ≤ 22:00
    expect(slots).toHaveLength(27);
  });

  it('не пропонує слотів у вихідний день', () => {
    expect(slotsFor('2026-11-02', HOURS, [{ date: '2026-11-02', reason: 'x' }], 30)).toEqual([]);
  });

  it('парсить час на хвилини, включно з >24', () => {
    expect(toMinutes('08:30')).toBe(510);
    expect(toMinutes('26:00')).toBe(1560);
    expect(() => toMinutes('ab')).toThrow();
  });
});

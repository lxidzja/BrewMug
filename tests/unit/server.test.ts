import { describe, expect, it, beforeEach } from 'vitest';
import { handleBooking, handleContact, handleAvailability, resetRateLimit, type HandlerConfig } from '@server/handlers';
import { MemoryStore } from '@server/store';
import { notify } from '@server/notify';
import { bookingMessage } from '@server/notify';
import { normalizePhone } from '@/lib/validation';

const SITE = {
  timezone: 'Europe/Kyiv',
  hours: [
    { days: [1, 2, 3, 4], open: '08:00', close: '22:00' },
    { days: [5], open: '08:00', close: '23:00' },
    { days: [6], open: '09:00', close: '23:00' },
    { days: [0], open: '09:00', close: '21:00' },
  ],
  closures: [],
  booking: {
    minLeadMinutes: 120,
    horizonDays: 30,
    slotStepMinutes: 30,
    maxGuests: 10,
    capacityPerSlot: 24,
    holdMinutes: 120,
  },
};

// 2026-11-02 (понеділок) 10:00 за Києвом = 08:00Z
const NOW = () => new Date('2026-11-02T08:00:00Z');

function makeCfg(store = new MemoryStore(), overrides: Partial<HandlerConfig> = {}): HandlerConfig {
  return {
    site: SITE,
    store,
    notify: async () => [{ channel: 'test', ok: true }],
    bookingMessage,
    minFillMs: 0,
    rateLimitPerHour: 100,
    expectedOrigin: 'https://brewmug.example',
    now: NOW,
    ...overrides,
  };
}

function formReq(path: string, fields: Record<string, string>, accept = 'application/json'): Request {
  const body = new URLSearchParams(fields);
  return new Request('https://brewmug.example' + path, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept, 'cf-connecting-ip': '1.2.3.4' },
  });
}

const good = {
  name: 'Марія Ковальчук',
  phone: '+380 (44) 123-45-67',
  date: '2026-11-02',
  time: '18:30',
  guests: '2',
  wishes: 'біля вікна',
};

beforeEach(() => resetRateLimit());

describe('нормалізація телефону', () => {
  it('приймає різні формати', () => {
    expect(normalizePhone('+380 44 123 45 67')).toBe('+380441234567');
    expect(normalizePhone('380441234567')).toBe('+380441234567');
    expect(normalizePhone('0 (44) 123-45-67')).toBe('+380441234567');
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('бронювання', () => {
  it('приймає валідну заявку і зберігає її', async () => {
    const store = new MemoryStore();
    const res = await handleBooking(formReq('/api/booking', good), makeCfg(store));
    expect(res.status).toBe(201);
    expect(store.bookings).toHaveLength(1);
    expect(store.bookings[0]!.phone).toBe('+380441234567');
    expect(store.bookings[0]!.guests).toBe(2);
  });

  it('без JS: відповідає редіректом 303 на сторінку подяки', async () => {
    const res = await handleBooking(formReq('/api/booking', good, 'text/html'), makeCfg());
    expect(res.status).toBe(303);
    expect(res.headers?.location).toMatch(/^\/broniuvannia\/zaiavku-pryiniato\//);
  });

  it('повертає помилки полів, коли дані некоректні', async () => {
    const res = await handleBooking(formReq('/api/booking', { ...good, phone: '123', name: 'М', guests: '0' }), makeCfg());
    expect(res.status).toBe(422);
    const body = res.body as { errors: Record<string, string> };
    expect(Object.keys(body.errors).sort()).toEqual(['guests', 'name', 'phone']);
  });

  it('відхиляє час, на який уже запізно (менше 2 годин)', async () => {
    // зараз 10:00 Київ; 11:00 — замало запасу
    const res = await handleBooking(formReq('/api/booking', { ...good, time: '11:00' }), makeCfg());
    expect(res.status).toBe(422);
    expect((res.body as { errors: Record<string, string> }).errors.time).toBeTruthy();
  });

  it('відхиляє дату поза горизонтом', async () => {
    const res = await handleBooking(formReq('/api/booking', { ...good, date: '2027-06-01' }), makeCfg());
    expect(res.status).toBe(422);
  });

  it('пропонує інший час, коли слот заповнений', async () => {
    const store = new MemoryStore();
    // заповнюємо 18:30 повністю
    await store.insertBooking({
      id: 'x1', name: 'A', phone: '+380441111111', date: '2026-11-02', time: '18:30', guests: 24,
      wishes: '', status: 'confirmed', createdAt: NOW().toISOString(),
    });
    const res = await handleBooking(formReq('/api/booking', good), makeCfg(store));
    expect(res.status).toBe(409);
    const body = res.body as { alternatives: string[] };
    expect(body.alternatives.length).toBeGreaterThan(0);
    expect(body.alternatives).not.toContain('18:30');
  });

  it('мовчки відсікає бота через honeypot', async () => {
    const store = new MemoryStore();
    const res = await handleBooking(formReq('/api/booking', { ...good, company: 'bot' }), makeCfg(store));
    expect(res.status).toBe(201);
    expect(store.bookings).toHaveLength(0);
  });

  it('обмежує частоту запитів', async () => {
    const cfg = makeCfg(new MemoryStore(), { rateLimitPerHour: 2 });
    await handleBooking(formReq('/api/booking', good), cfg);
    await handleBooking(formReq('/api/booking', good), cfg);
    const res = await handleBooking(formReq('/api/booking', good), cfg);
    expect(res.status).toBe(429);
  });

  it('не втрачає заявку, якщо сповіщення впало', async () => {
    const store = new MemoryStore();
    const res = await handleBooking(
      formReq('/api/booking', good),
      makeCfg(store, {
        notify: async () => [{ channel: 'telegram', ok: false, error: 'timeout' }],
      }),
    );
    expect(res.status).toBe(201);
    expect(store.bookings).toHaveLength(1);
  });
});

describe('звернення', () => {
  it('приймає валідне звернення', async () => {
    const store = new MemoryStore();
    const res = await handleContact(
      formReq('/api/contact', { name: 'Олег', phone: '', message: 'Чи можна з собакою?' }),
      makeCfg(store),
    );
    expect(res.status).toBe(201);
    expect(store.contacts).toHaveLength(1);
  });

  it('відхиляє надто коротке повідомлення', async () => {
    const res = await handleContact(formReq('/api/contact', { name: 'Олег', message: 'Привіт' }), makeCfg());
    expect(res.status).toBe(422);
  });
});

describe('доступність слотів', () => {
  it('повертає слоти на дату із позначками', async () => {
    const res = await handleAvailability(new URL('https://brewmug.example/api/availability?date=2026-11-02'), makeCfg());
    expect(res.status).toBe(200);
    const body = res.body as { slots: { time: string; available: boolean }[] };
    const at = (t: string) => body.slots.find((s) => s.time === t);
    expect(at('10:00')?.available).toBe(false); // замало запасу (10:00 + 120 хв > 10:00)
    expect(at('12:30')?.available).toBe(true);
  });

  it('відхиляє некоректну дату', async () => {
    const res = await handleAvailability(new URL('https://brewmug.example/api/availability?date=xx'), makeCfg());
    expect(res.status).toBe(400);
  });
});

describe('сповіщення', () => {
  it('екранує спецсимволи для Telegram', async () => {
    const { escapeTelegram } = await import('@server/notify');
    expect(escapeTelegram('Імʼя: a_b*c[d]')).toBe('Імʼя: a\\_b\\*c\\[d\\]');
  });

  it('повертає позначку, якщо канали не налаштовані', async () => {
    const r = await notify({}, 'test');
    expect(r[0]!.channel).toBe('none');
    expect(r[0]!.ok).toBe(false);
  });
});

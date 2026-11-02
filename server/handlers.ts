/**
 * Бізнес-логіка обробки форм. Не залежить від платформи:
 * приймає FormData/JSON, повертає { status, body } або редірект.
 * Використовується і в Cloudflare Functions, і в локальному dev-сервері, і в тестах.
 */
import { bookingSchema, contactSchema, fieldErrors } from '../src/lib/validation';
import { openState, isoDateInZone } from '../src/lib/hours';
import { isSlotInFuture, isWithinHorizon, slotsWithAvailability } from '../src/lib/booking';
import type { bookingMessage, NotifyResult, notify } from './notify';
import type { Store } from './store';

export interface HandlerConfig {
  site: {
    timezone: string;
    hours: { days: number[]; open: string; close: string }[];
    closures: { date: string; reason: string }[];
    booking: {
      minLeadMinutes: number;
      horizonDays: number;
      slotStepMinutes: number;
      maxGuests: number;
      capacityPerSlot: number;
      holdMinutes: number;
    };
  };
  store: Store;
  notify: typeof notify;
  bookingMessage: typeof bookingMessage;
  /** мс, протягом яких форма має бути заповнена (антибот) */
  minFillMs?: number;
  /** ліміт запитів за IP за годину */
  rateLimitPerHour?: number;
  /** істинний origin сайту для перевірки */
  expectedOrigin?: string;
  now?: () => Date;
}

export interface ApiResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  body,
});

/** Простий ліміт у памʼяті процесу (у безсерверному середовищі це орієнтир, а не гарантія). */
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, perHour: number, now = Date.now()): boolean {
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (arr.length >= perHour) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}
/** Скидання лімітів — лише для тестів. */
export function resetRateLimit() {
  buckets.clear();
}

export async function readInput(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      const raw = (await req.json()) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) out[k] = v == null ? '' : String(v);
      return out;
    } catch {
      return {};
    }
  }
  const fd = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) out[k] = typeof v === 'string' ? v : '';
  return out;
}

function clientKey(req: Request): string {
  // IP не зберігаємо: рахуємо хеш, щоб не тримати персональні дані
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'local';
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (Math.imul(31, h) + ip.charCodeAt(i)) | 0;
  return 'ip:' + Math.abs(h).toString(36);
}

export async function handleBooking(req: Request, cfg: HandlerConfig): Promise<ApiResponse> {
  const now = cfg.now?.() ?? new Date();
  const fmt = req.headers.get('accept') ?? '';

  // необовʼязковий заголовок для кінцевих тестів (e2e): окремий «бакет» на кожен запуск
  const testKey = req.headers.get('x-e2e-run');
  const bucketKey = (testKey ? 'e2e:' + testKey : clientKey(req)) + ':booking';
  if (!rateLimit(bucketKey, cfg.rateLimitPerHour ?? 10, now.getTime())) {
    return json(429, { ok: false, error: 'Забагато заявок поспіль. Спробуйте за годину або зателефонуйте.' }, {
      'retry-after': '3600',
    });
  }

  const raw = await readInput(req);
  // honeypot: заповнене приховане поле = бот; відповідаємо «успіхом», щоб не підказувати
  if (raw.company) return json(201, { ok: true });
  // занадто швидке заповнення
  const ts = Number(raw.ts ?? 0);
  const minMs = cfg.minFillMs ?? 1500;
  if (ts && now.getTime() - ts < minMs) return json(400, { ok: false, error: 'Форма надіслана занадто швидко.' });

  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    return json(422, { ok: false, errors: fieldErrors(parsed.error) });
  }
  const data = parsed.data;

  const today = isoDateInZone(now, cfg.site.timezone);
  if (!isWithinHorizon(data.date, today, cfg.site.booking.horizonDays)) {
    return json(422, { ok: false, errors: { date: 'Оберіть дату в межах найближчих 30 днів' } });
  }
  if (data.guests > cfg.site.booking.maxGuests) {
    return json(422, { ok: false, errors: { guests: `Максимум ${cfg.site.booking.maxGuests} гостей. Більше — телефоном.` } });
  }
  if (!isSlotInFuture(data.date, data.time, now, cfg.site.timezone, cfg.site.booking.minLeadMinutes)) {
    return json(422, { ok: false, errors: { time: 'На цей час уже запізно — оберіть пізніший' } });
  }

  // місткість (транзакційність у D1 забезпечує умовний INSERT — див. міграцію)
  const taken = await cfg.store.takenByTime(data.date);
  const used = taken[data.time] ?? 0;
  if (used + data.guests > cfg.site.booking.capacityPerSlot) {
    const slots = slotsWithAvailability(
      data.date,
      cfg.site.hours,
      cfg.site.closures,
      cfg.site.booking,
      now,
      cfg.site.timezone,
      taken,
    );
    const alternatives = slots.filter((s) => s.available).map((s) => s.time).slice(0, 4);
    return json(409, {
      ok: false,
      error: 'На цей час місць немає',
      alternatives,
    });
  }

  const record = {
    id: crypto.randomUUID(),
    name: data.name,
    phone: data.phone,
    date: data.date,
    time: data.time,
    guests: data.guests,
    wishes: data.wishes ?? '',
    status: 'new' as const,
    createdAt: now.toISOString(),
  };
  const stored = await cfg.store.insertBooking(record);
  if (!stored) return json(409, { ok: false, error: 'Схоже, ця заявка вже прийнята.' });

  const notifications = await cfg.notify(
    { TELEGRAM_BOT_TOKEN: env('TELEGRAM_BOT_TOKEN'), TELEGRAM_CHAT_ID: env('TELEGRAM_CHAT_ID'), WEBHOOK_URL: env('WEBHOOK_URL') },
    cfg.bookingMessage(record),
  );

  // звичайна HTML-форма → редірект на сторінку подяки (PRG, без повторної відправки)
  if (!fmt.includes('application/json')) {
    return { status: 303, headers: { location: `/broniuvannia/zaiavku-pryiniato/?id=${record.id.slice(0, 8)}` }, body: null };
  }
  return json(201, {
    ok: true,
    id: record.id,
    message: 'Заявку прийнято. Зателефонуємо протягом 15 хвилин.',
    notified: notifications.map((n: NotifyResult) => ({ channel: n.channel, ok: n.ok })),
  });
}

export async function handleContact(req: Request, cfg: HandlerConfig): Promise<ApiResponse> {
  const now = cfg.now?.() ?? new Date();
  const fmt = req.headers.get('accept') ?? '';

  const testKeyC = req.headers.get('x-e2e-run');
  const bucketKeyC = (testKeyC ? 'e2e:' + testKeyC : clientKey(req)) + ':contact';
  if (!rateLimit(bucketKeyC, cfg.rateLimitPerHour ?? 10, now.getTime())) {
    return json(429, { ok: false, error: 'Забагато звернень. Спробуйте пізніше.' });
  }
  const raw = await readInput(req);
  if (raw.company) return json(201, { ok: true });
  const ts = Number(raw.ts ?? 0);
  if (ts && now.getTime() - ts < (cfg.minFillMs ?? 1500)) return json(400, { ok: false, error: 'Форма надіслана занадто швидко.' });

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return json(422, { ok: false, errors: fieldErrors(parsed.error) });

  const rec = {
    id: crypto.randomUUID(),
    name: parsed.data.name,
    phone: parsed.data.phone ?? '',
    message: parsed.data.message,
    createdAt: now.toISOString(),
  };
  await cfg.store.insertContact(rec);
  await cfg.notify(
    { TELEGRAM_BOT_TOKEN: env('TELEGRAM_BOT_TOKEN'), TELEGRAM_CHAT_ID: env('TELEGRAM_CHAT_ID'), WEBHOOK_URL: env('WEBHOOK_URL') },
    ['Нове звернення з сайту', `Імʼя: ${rec.name}`, rec.phone ? `Телефон: ${rec.phone}` : '', `Текст: ${rec.message}`]
      .filter(Boolean)
      .join('\n'),
  );

  if (!fmt.includes('application/json')) {
    return { status: 303, headers: { location: '/kontakty/?sent=1#form' }, body: null };
  }
  return json(201, { ok: true, message: 'Дякуємо! Відповімо протягом дня.' });
}

export async function handleAvailability(url: URL, cfg: HandlerConfig): Promise<ApiResponse> {
  const date = url.searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { ok: false, error: 'Некоректна дата' });
  const now = cfg.now?.() ?? new Date();
  const today = isoDateInZone(now, cfg.site.timezone);
  if (!isWithinHorizon(date, today, cfg.site.booking.horizonDays)) return json(422, { ok: false, error: 'Дата поза горизонтом' });

  const taken = await cfg.store.takenByTime(date);
  const slots = slotsWithAvailability(date, cfg.site.hours, cfg.site.closures, cfg.site.booking, now, cfg.site.timezone, taken);
  const state = openState(now, cfg.site.timezone, cfg.site.hours, cfg.site.closures);
  return json(200, { ok: true, date, slots, open: state.open }, { 'cache-control': 'no-store' });
}

/** Доступ до змінних середовища без падіння на клієнті. */
function env(key: string): string | undefined {
  const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[key];
}

/** Відповідь у форматі Web API (Response) з ApiResponse. */
export function toResponse(r: ApiResponse): Response {
  if (r.status === 303) return new Response(null, { status: 303, headers: r.headers });
  return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers });
}

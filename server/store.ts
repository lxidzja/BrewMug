/**
 * Зберігання заявок. Абстракція над сховищем:
 *   - D1Store — SQLite-сховище Cloudflare D1 (production);
 *   - MemoryStore — у памʼяті (локальний запуск і тести);
 *   - FileStore — JSON-файл (локальний запуск із збереженням між перезапусками).
 * Код сервісу не знає, яке саме сховище використовується.
 */
export interface BookingRecord {
  id: string;
  name: string;
  phone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  guests: number;
  wishes: string;
  status: 'new' | 'confirmed' | 'cancelled';
  createdAt: string; // ISO
}

export interface ContactRecord {
  id: string;
  name: string;
  phone: string;
  message: string;
  createdAt: string;
}

export interface Store {
  /** Скільки гостей уже заброньовано на кожен час у цю дату (лише активні). */
  takenByTime(date: string): Promise<Record<string, number>>;
  insertBooking(r: BookingRecord): Promise<boolean>;
  insertContact(r: ContactRecord): Promise<void>;
  /** Видаляє записи, старші за days (BR 004: зберігаємо лише потрібний строк). */
  purgeOlderThan(days: number): Promise<number>;
  countSince(isoDate: string): Promise<{ bookings: number; contacts: number }>;
}

/** Мінімальний інтерфейс D1 (щоб не тягнути типи Cloudflare у збірку). */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results: T[] }>;
      run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
    };
  };
}

export class D1Store implements Store {
  constructor(private db: D1Like) {}

  async takenByTime(date: string): Promise<Record<string, number>> {
    const { results } = await this.db
      .prepare(
        `SELECT time, SUM(guests) AS guests FROM bookings
         WHERE date = ? AND status IN ('new','confirmed') GROUP BY time`,
      )
      .bind(date)
      .all<{ time: string; guests: number }>();
    const out: Record<string, number> = {};
    for (const r of results) out[r.time] = Number(r.guests);
    return out;
  }

  async insertBooking(r: BookingRecord): Promise<boolean> {
    const res = await this.db
      .prepare(
        `INSERT INTO bookings (id, name, phone, date, time, guests, wishes, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(r.id, r.name, r.phone, r.date, r.time, r.guests, r.wishes, r.status, r.createdAt)
      .run();
    return res.success;
  }

  async insertContact(r: ContactRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO contacts (id, name, phone, message, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(r.id, r.name, r.phone, r.message, r.createdAt)
      .run();
  }

  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const a = await this.db.prepare(`DELETE FROM bookings WHERE created_at < ?`).bind(cutoff).run();
    const b = await this.db.prepare(`DELETE FROM contacts WHERE created_at < ?`).bind(cutoff).run();
    return (a.meta?.changes ?? 0) + (b.meta?.changes ?? 0);
  }

  async countSince(isoDate: string) {
    const since = `${isoDate}T00:00:00.000Z`;
    const b = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM bookings WHERE created_at >= ?`)
      .bind(since)
      .first<{ n: number }>();
    const c = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM contacts WHERE created_at >= ?`)
      .bind(since)
      .first<{ n: number }>();
    return { bookings: Number(b?.n ?? 0), contacts: Number(c?.n ?? 0) };
  }
}

/** Сховище в памʼяті — для тестів і швидкого локального запуску. */
export class MemoryStore implements Store {
  bookings: BookingRecord[] = [];
  contacts: ContactRecord[] = [];

  async takenByTime(date: string) {
    const out: Record<string, number> = {};
    for (const b of this.bookings) {
      if (b.date === date && b.status !== 'cancelled') out[b.time] = (out[b.time] ?? 0) + b.guests;
    }
    return out;
  }
  async insertBooking(r: BookingRecord) {
    const exists = this.bookings.some((b) => b.id === r.id);
    if (exists) return false;
    this.bookings.push(r);
    return true;
  }
  async insertContact(r: ContactRecord) {
    this.contacts.push(r);
  }
  async purgeOlderThan(days: number) {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const b0 = this.bookings.length;
    const c0 = this.contacts.length;
    this.bookings = this.bookings.filter((x) => x.createdAt >= cutoff);
    this.contacts = this.contacts.filter((x) => x.createdAt >= cutoff);
    return b0 - this.bookings.length + (c0 - this.contacts.length);
  }
  async countSince(isoDate: string) {
    const since = `${isoDate}T00:00:00.000Z`;
    return {
      bookings: this.bookings.filter((b) => b.createdAt >= since).length,
      contacts: this.contacts.filter((c) => c.createdAt >= since).length,
    };
  }
}

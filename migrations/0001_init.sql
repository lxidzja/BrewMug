-- BrewMug: схема зберігання заявок (Cloudflare D1 / SQLite).
-- Запуск: wrangler d1 migrations apply brewmug --remote

CREATE TABLE IF NOT EXISTS bookings (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  date        TEXT NOT NULL,           -- YYYY-MM-DD
  time        TEXT NOT NULL,           -- HH:MM
  guests      INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 50),
  wishes      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',  -- new | confirmed | cancelled
  created_at  TEXT NOT NULL            -- ISO-8601
);

CREATE TABLE IF NOT EXISTS contacts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- Швидкий підрахунок зайнятості слота (date+time) і чистка за строком зберігання
CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings (date, time);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts (created_at);

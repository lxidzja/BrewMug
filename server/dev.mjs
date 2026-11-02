/**
 * Локальний dev-сервер: статика з dist/ + API (/api/booking, /api/contact, /api/availability).
 * Зберігання — JSON-файл у .local/ (у .gitignore).
 * Запуск: npm run build && npm run server:dev  → http://localhost:8788
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { parse } from 'yaml';
import { handleBooking, handleContact, handleAvailability, toResponse } from './handlers.ts';
import { notify, bookingMessage } from './notify.ts';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const DATA = join(ROOT, '.local', 'db.json');
const PORT = Number(process.env.PORT ?? 8788);

/** Файлове сховище для локальної розробки (дані лежать у .local/, у git не потрапляють). */
class FileStore {
  constructor(path) {
    this.path = path;
  }
  async read() {
    try {
      return JSON.parse(await readFile(this.path, 'utf8'));
    } catch {
      return { bookings: [], contacts: [] };
    }
  }
  async write(db) {
    await mkdir(join(ROOT, '.local'), { recursive: true });
    await writeFile(this.path, JSON.stringify(db, null, 1), 'utf8');
  }
  async takenByTime(date) {
    const db = await this.read();
    const out = {};
    for (const b of db.bookings) if (b.date === date && b.status !== 'cancelled') out[b.time] = (out[b.time] ?? 0) + b.guests;
    return out;
  }
  async insertBooking(r) {
    const db = await this.read();
    if (db.bookings.some((b) => b.id === r.id)) return false;
    db.bookings.push(r);
    await this.write(db);
    return true;
  }
  async insertContact(r) {
    const db = await this.read();
    db.contacts.push(r);
    await this.write(db);
  }
  async purgeOlderThan(days) {
    const db = await this.read();
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const before = db.bookings.length + db.contacts.length;
    db.bookings = db.bookings.filter((b) => b.createdAt >= cutoff);
    db.contacts = db.contacts.filter((c) => c.createdAt >= cutoff);
    await this.write(db);
    return before - db.bookings.length - db.contacts.length;
  }
  async countSince(isoDate) {
    const db = await this.read();
    const since = `${isoDate}T00:00:00.000Z`;
    return {
      bookings: db.bookings.filter((b) => b.createdAt >= since).length,
      contacts: db.contacts.filter((c) => c.createdAt >= since).length,
    };
  }
}

const site = parse(readFileSync(join(ROOT, 'src', 'data', 'site.yaml'), 'utf8'));
const cfg = {
  site,
  store: new FileStore(DATA),
  notify,
  bookingMessage,
  minFillMs: 1200,
  rateLimitPerHour: 20,
};

await cfg.store.purgeOlderThan(site.privacy?.retentionDays ?? 90);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function serveStatic(pathname, res) {
  let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (rel.split(/[/\\]/).includes('..')) {
    res.writeHead(403);
    return res.end();
  }
  let file = join(DIST, rel);
  const isFile = existsSync(file) && (await stat(file)).isFile();
  if (!isFile) {
    const withIndex = join(DIST, rel, 'index.html');
    if (existsSync(withIndex)) file = withIndex;
  }
  if (!existsSync(file)) {
    const nf = join(DIST, '404.html');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(existsSync(nf) ? await readFile(nf) : 'Not found');
  }
  const headers = { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' };
  if (file.includes('_assets')) headers['cache-control'] = 'public, max-age=31536000, immutable';
  res.writeHead(200, headers);
  res.end(await readFile(file));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    try {
      const webReq = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: req.method === 'POST' ? await readBody(req) : undefined,
      });
      let out;
      if (url.pathname === '/api/booking' && req.method === 'POST') out = await handleBooking(webReq, cfg);
      else if (url.pathname === '/api/contact' && req.method === 'POST') out = await handleContact(webReq, cfg);
      else if (url.pathname === '/api/availability' && req.method === 'GET') out = await handleAvailability(url, cfg);
      else out = { status: 404, body: { ok: false, error: 'Не знайдено' } };

      const r = toResponse(out);
      if (r.status === 303) {
        res.writeHead(303, { location: r.headers.get('location') ?? '/' });
        return res.end();
      }
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(await r.text());
    } catch (e) {
      console.error('[api]', e);
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Внутрішня помилка' }));
    }
  }

  return serveStatic(url.pathname, res);
});

server.listen(PORT, () => console.log(`локальний сервер: http://localhost:${PORT}`));

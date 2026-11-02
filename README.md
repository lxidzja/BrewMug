# BrewMug — сайт кав'ярні

Адаптивний сайт кав'ярні: меню з категоріями, контакти з годинними роботи, броньювання столика й форма звернення. Статичний HTML/CSS, JavaScript лише для поліпшень.

**Стек:** Astro 7 + TypeScript, чистий CSS з токенами, YAML-дані з перевіркою Zod, самохостинг шрифтів, Cloudflare Pages + D1 для форм.

**Карта:** на сторінці контактів — вбудова Google Maps одразу (iframe, loading="lazy"), плюс посилання «прокласти маршрут» і OpenStreetMap.

---

## Швидкий старт

```bash
npm install
npm run build:preview     # збірка з заглушками (див. «Дані»)
npm run server:dev        # http://localhost:8788 — статика + API
```

> `npm run build` без `:preview` **навмисно падає**, якщо в даних лишилися заглушки (`placeholder: true`). Це захист від публікації вигаданих даних.

### Скрипти

| Команда | Що робить |
|---|---|
| `npm run dev` | Дев-сервер Astro (без API; форми перевіряютьься тільки на `server:dev`) |
| `npm run build` | Production-збірка (перевірка даних → Astro) |
| `npm run build:preview` | Збірка з дозволеними заглушками |
| `npm run server:dev` | Локальний сервер: `dist/` + `/api/*`, дані в `.local/db.json` |
| `npm run check` | Типи Astro + TypeScript |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm test` | Юніт-тести (Vitest): години, слоти, форми |
| `npm run test:e2e` | E2E + axe (Playwright, 4 браузери) |
| `npm run lhci` | Lighthouse CI (бюджети в `lighthouserc.json`) |
| `npm run tokens` | Перегенерувати `src/styles/tokens.css` з `design/tokens.mjs` |
| `npm run stats` | Скільки заявок за місяць (метрика BR ≥20/міс) |

---

## Структура

```
src/
  data/site.yaml        ← адреса, телефон, години (єдине джерело)
  data/menu/*.yaml      ← меню за категоріями
  data/content/pages.yaml ← тексти «Про нас» і «Контакти»
  pages/                ← маршрути
  components/           ← UI (Button, MenuItem, BookingForm…)
  lib/                  ← години, слоти, схеми валідції
  scripts/              ← клієнтський JS (прогресивне поліпшення)
  styles/               ← tokens.css (генерується), base.css, fonts.css
server/                 ← логіка API (не залежить від платформи)
functions/api/          ← обгортки для Cloudflare
tests/                  ← unit, e2e, a11y
design/                 ← токени, генератор ілюстрацій, шрифти
migrations/             ← SQL для D1
```

---

## Дані (BR 002: меню без правки коду)

Усе контентне — у YAML. Після зміни `site.yaml` або `menu/*.yaml` достатньо перезібрати сайт: години оновляться в шапці, на головній, у футері, на контактах і в бронюванні одночасно.

**Що потрібно замінити перед публікацією** (позначено `placeholder: true`):

- `site.yaml`: адреса, телефон, email, реальні години роботи;
- `content/pages.yaml`: цифри (12 кг / 42 місця / 7 років), імена й описи команди;
- меню: ціни й позиції снеків.

Після заміни — прибрати рядки `placeholder: true`.

---

## Форми: як працює

- **Без JS** — звичайний POST: сервер повертає редірект на сторінку подяки (або з помилками).
- **З JS** — `fetch`, жива підказка вільних годин (`/api/availability`), помилки поруч із полями.

### API

| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/booking` | заявка на столик |
| POST | `/api/contact` | звернення |
| GET | `/api/availability?date=YYYY-MM-DD` | вільні години |
| GET | `/api/prune` | видалення заявок старше строку (cron) |

Коди: `201/303` успіх, `422` помилки полів, `409` слот зайнятий (+ `alternatives`), `429` ліміт запитів, `400` антибот.

### Сповіщення власнику

```bash
TELEGRAM_BOT_TOKEN=...   # токен бота від @BotFather
TELEGRAM_CHAT_ID=...     # id чату власника
WEBHOOK_URL=...          # необов'язково: Slack/ntfy/власний бот
```

Скопіюйте `.env.example` → `.dev.vars`. Якщо канали не налаштовані, заявка все одно зберігається (сервер повертає `notified: none`).

---

## Персональні дані (BR 004)

Зберігаємо лише ім'я, телефон, дату/час/гостей і текст — для обробки заявки. Строк — `privacy.retentionDays` у `site.yaml` (90 днів), після чого автовидалення (`functions/api/prune.ts` + cron). IP не зберігається, лише солоний хеш для ліміту запитів у пам'яті.

Політика для гостей: `/konfidentsiinist/`. **Чернетку має перевірити власник або юрист.**

---

## Розгортання (Cloudflare)

```bash
npx wrangler d1 create brewmug                     # отримаєте database_id
# впишіть database_id у wrangler.toml
npx wrangler d1 migrations apply brewmug --remote
npx wrangler pages deploy dist --project-name brewmug
npx wrangler secret put TELEGRAM_BOT_TOKEN         # і TELEGRAM_CHAT_ID
```

`public/_headers` містить CSP, кеш і заголовки безпеки.

---

## Доступність і швидкість

- WCAG 2.1 AA: контраст перевірено скриптом (`design/contrast-check.mjs`), axe без порушень на всіх сторінках.
- Lighthouse (desktop, локально): **100/100/100/100** на головній, меню, контактах і бронюванні.
- Вага сторінки ~260–350 КБ, з них 205 КБ — три родини шрифтів, субсетованих до потрібних символів.
- JavaScript: ~3 КБ (статус «відчинено» + форма).

---

## Документація

- [План реалізації](docs/implementation-plan.md) — вимоги, рішення, фази, тест-кейси
- [Архітектура](docs/architecture.md)
- [Як оновити меню й години](docs/how-to-update.md)
- [Доступність](docs/accessibility.md)
- [QA-звіт](docs/qa-report.md)

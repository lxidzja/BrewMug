# BrewMug — сайт кав'ярні

Адаптивний сайт кав'ярні: меню з категоріями, контакти з годинними роботи, броньювання столика й форма звернення. Статичний HTML/CSS, JavaScript лише для поліпшень.

**Стек:** Astro 7 + TypeScript, чистий CSS з токенами, YAML-дані з перевіркою Zod.

---

## Швидкий старт

```bash
npm install
npm run server:dev        # http://localhost:8788 — статика + API
```

### Скрипти

| Команда | Що робить |
|---|---|
| `npm run dev` | Дев-сервер Astro (без API; форми перевіряютьься тільки на `server:dev`) |
| `npm run build` | Production-збірка (перевірка даних → Astro) |
| `npm run server:dev` | Локальний сервер: `dist/` + `/api/*`, дані в `.local/db.json` |
| `npm run check` | Типи Astro + TypeScript |
| `npm run lint` / `npm run format` | ESLint / Prettier |

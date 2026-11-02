/**
 * Cloudflare Pages Function: POST /api/booking
 * Тонка обгортка: платформа дає змінні середовища й D1, логіка — у server/handlers.ts.
 */
import { handleBooking, toResponse } from '../../server/handlers';
import { D1Store } from '../../server/store';
import { notify, bookingMessage } from '../../server/notify';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

interface Env {
  DB: Parameters<typeof D1Store.prototype.takenByTime> extends never ? never : ConstructorParameters<typeof D1Store>[0];
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  WEBHOOK_URL?: string;
}

// site.yaml вшивається в бандл під час збірки Worker-а
const siteYaml = readFileSync(new URL('../../src/data/site.yaml', import.meta.url), 'utf8');
const site = parse(siteYaml);

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  // змінні середовища для notify()
  const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  g.process = g.process ?? {};
  g.process.env = { ...g.process.env, ...(ctx.env as unknown as Record<string, string | undefined>) };

  const res = await handleBooking(ctx.request, {
    site,
    store: new D1Store(ctx.env.DB),
    notify,
    bookingMessage,
    minFillMs: 1200,
    rateLimitPerHour: 10,
  });
  return toResponse(res);
};

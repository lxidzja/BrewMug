/**
 * Cloudflare Pages Function: POST /api/contact
 */
import { handleContact, toResponse } from '../../server/handlers';
import { D1Store } from '../../server/store';
import { notify, bookingMessage } from '../../server/notify';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

interface Env {
  DB: ConstructorParameters<typeof D1Store>[0];
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  WEBHOOK_URL?: string;
}

const site = parse(readFileSync(new URL('../../src/data/site.yaml', import.meta.url), 'utf8'));

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  g.process = g.process ?? {};
  g.process.env = { ...g.process.env, ...(ctx.env as unknown as Record<string, string | undefined>) };

  const res = await handleContact(ctx.request, {
    site,
    store: new D1Store(ctx.env.DB),
    notify,
    bookingMessage,
    minFillMs: 1200,
    rateLimitPerHour: 10,
  });
  return toResponse(res);
};

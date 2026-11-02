/**
 * Cloudflare Pages Function: cron-задача видалення старих заявок (BR 004).
 * Налаштовується у wrangler.toml: [triggers] crons = ["0 3 * * *"].
 * Викликається платформою як scheduled handler у Functions.
 */
import { D1Store } from '../../server/store';

interface Env {
  DB: ConstructorParameters<typeof D1Store>[0];
  RETENTION_DAYS?: string;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const days = Number(ctx.env.RETENTION_DAYS ?? 90);
  const removed = await new D1Store(ctx.env.DB).purgeOlderThan(days);
  return new Response(JSON.stringify({ ok: true, removed, retentionDays: days }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};

/**
 * Cloudflare Pages Function: GET /api/availability?date=YYYY-MM-DD
 */
import { handleAvailability, toResponse } from '../../server/handlers';
import { D1Store } from '../../server/store';
import { notify, bookingMessage } from '../../server/notify';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

interface Env {
  DB: ConstructorParameters<typeof D1Store>[0];
}

const site = parse(readFileSync(new URL('../../src/data/site.yaml', import.meta.url), 'utf8'));

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const res = await handleAvailability(url, {
    site,
    store: new D1Store(ctx.env.DB),
    notify,
    bookingMessage,
  });
  return toResponse(res);
};

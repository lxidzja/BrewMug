/**
 * Завантаження й перевірка даних сайту (чистий JS — без TS-синтаксису).
 * Помилки тут зупиняють збірку: меню не має потрапити на сайт із поламаними цінами (BR 002).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$|^2[0-5]:[0-5]\d$/, 'час у форматі HH:MM (допускається 24:00-25:59)');

export const siteSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().min(1),
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    postalCode: z.string().regex(/^\d{5}$/),
    note: z.string().default(''),
  }),
  phone: z.string().regex(/^\+380\d{9}$/, 'телефон у форматі +380XXXXXXXXX'),
  phoneDisplay: z.string().min(1),
  contactPlaceholder: z.boolean().default(false),
  email: z.string().email(),
  timezone: z.string().default('Europe/Kyiv'),
  hours: z.array(z.object({
    days: z.array(z.number().int().min(0).max(6)).min(1),
    open: hhmm,
    close: hhmm,
  })).min(1),
  closures: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string() })).default([]),
  booking: z.object({
    minLeadMinutes: z.number().int().nonnegative(),
    horizonDays: z.number().int().positive().max(90),
    slotStepMinutes: z.number().int().min(15).max(120),
    maxGuests: z.number().int().min(1).max(50),
    capacityPerSlot: z.number().int().positive(),
    holdMinutes: z.number().int().positive(),
  }),
  map: z.object({ lat: z.number(), lng: z.number(), label: z.string() }),
  privacy: z.object({ retentionDays: z.number().int().positive().max(3650) }).default({ retentionDays: 90 }),
  social: z.array(z.object({ label: z.string(), href: z.string().url() })).default([]),
});

const itemSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug: лише малі латинські літери, цифри й дефіс'),
  name: z.string().min(2),
  price: z.number().int().positive('ціна має бути цілим числом більше нуля'),
  description: z.string().min(5),
  illo: z.string().min(2),
  tag: z.enum(['hit', 'new']).nullish(),
});

export const menuSchema = z.object({
  category: z.string().min(2),
  title: z.string().min(2),
  hand: z.string().default('наше меню'),
  note: z.string().default(''),
  updatedAt: z.coerce.date(),
  items: z.array(itemSchema).min(1),
});

function readYaml(path) {
  return parse(readFileSync(path, 'utf8'));
}

function collectPlaceholders(node, path = '') {
  const out = [];
  if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...collectPlaceholders(v, `${path}[${i}]`)));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const p = path ? `${path}.${k}` : k;
      if (k === 'placeholder' && v === true) out.push(p);
      else out.push(...collectPlaceholders(v, p));
    }
  }
  return out;
}

export function formatIssues(err) {
  return err.issues.map((i) => `  ${i.path.join('.') || '(корінь)'}: ${i.message}`).join('\n');
}

/** Завантажує й перевіряє всі дані. Кидає Error з людським текстом. */
export function loadData(root) {
  const dataDir = join(root, 'src', 'data');

  const rawSite = readYaml(join(dataDir, 'site.yaml'));
  const siteParsed = siteSchema.safeParse(rawSite);
  if (!siteParsed.success) throw new Error('site.yaml:\n' + formatIssues(siteParsed.error));

  const menuDir = join(dataDir, 'menu');
  const menu = [];
  for (const file of readdirSync(menuDir).filter((f) => f.endsWith('.yaml'))) {
    const parsed = menuSchema.safeParse(readYaml(join(menuDir, file)));
    if (!parsed.success) throw new Error(`menu/${file}:\n` + formatIssues(parsed.error));
    menu.push(parsed.data);
  }
  // стабільний порядок категорій: кава, напої, десерти, снеки
  const order = ['kava', 'chai', 'deserty', 'sneky'];
  menu.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));

  // Перехресні перевірки бізнес-правил
  const errors = [];
  const allSlugs = menu.flatMap((c) => c.items.map((i) => `${c.slug}/${i.slug}`));
  const dup = allSlugs.filter((s, i) => allSlugs.indexOf(s) !== i);
  if (dup.length) errors.push(`повторювані slug: ${[...new Set(dup)].join(', ')}`);

  const total = menu.reduce((n, c) => n + c.items.length, 0);
  if (total < 15) errors.push(`усього позицій ${total}, а BR вимагає щонайменше 15`);
  if (menu.length < 4) errors.push(`категорій ${menu.length}, а BR вимагає чотири (кава, чай, десерти, снеки)`);

  const cats = menu.map((c) => c.category).sort().join(',');
  if (cats !== 'chai,deserty,kava,sneky') errors.push(`очікувались категорії chai, deserty, kava, sneky — отримано ${cats}`);

  let available = new Set();
  try {
    available = new Set(
      readdirSync(join(root, 'src', 'assets', 'illo'))
        .filter((f) => f.endsWith('.svg'))
        .map((f) => f.replace(/\.svg$/, '')),
    );
  } catch {
    errors.push('немає теки src/assets/illo');
  }
  for (const c of menu) {
    for (const it of c.items) {
      if (!available.has(it.illo)) {
        errors.push(`позиція ${c.category}/${it.slug}: немає ілюстрації "${it.illo}.svg"`);
      }
    }
  }

  if (errors.length) throw new Error('Дані не пройшли перевірку BR:\n  • ' + errors.join('\n  • '));

  const placeholders = collectPlaceholders(rawSite);
  if (siteParsed.data.contactPlaceholder) placeholders.push('phoneDisplay/email');
  return { site: siteParsed.data, menu, placeholders };
}
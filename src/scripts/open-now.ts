/**
 * Живий статус «відчинено / зачинено» (BR 001).
 * Розрахунок ведеться в часовому поясі кав'ярні, незалежно від поясу відвідувача.
 * Якщо JS не працює — на сторінці лишається таблиця годин роботи.
 */
import { openState, describeChange, isoDateInZone, WEEKDAY_LABEL } from '../lib/hours-client';
import type { HoursRule } from '../lib/types';

interface HoursPayload {
  hours: HoursRule[];
  closures: { date: string; reason: string }[];
  timezone: string;
}

const DATA_ID = 'hours-data';

function readPayload(): HoursPayload | null {
  const el = document.getElementById(DATA_ID);
  if (!el) return null;
  try {
    return JSON.parse(el.textContent ?? '') as HoursPayload;
  } catch {
    return null;
  }
}

function render(el: Element, payload: HoursPayload) {
  const now = new Date();
  const state = openState(now, payload.timezone, payload.hours, payload.closures);
  const textEl = el.querySelector('[data-open-now-text]');
  if (!textEl) return;

  const when = describeChange(now, payload.timezone, state);
  if (state.open) {
    textEl.textContent = when ? `Зараз відчинено · ${when}` : 'Зараз відчинено';
    el.setAttribute('data-state', 'open');
  } else {
    const today = isoDateInZone(now, payload.timezone);
    const tomorrow = isoDateInZone(new Date(now.getTime() + 86_400_000), payload.timezone);
    const opensDay = state.changesAt ? isoDateInZone(new Date(state.changesAt), payload.timezone) : '';
    const dayWord = opensDay === today ? '' : opensDay === tomorrow ? 'завтра ' : opensDay ? `${WEEKDAY_LABEL[new Date(state.changesAt!).getUTCDay()]} ` : '';
    textEl.textContent = when ? `Зараз зачинено · відчинимо ${dayWord}${when}` : 'Зараз зачинено';
    el.setAttribute('data-state', 'closed');
  }
  el.setAttribute('title', 'Оновлюється автоматично');
}

function init() {
  const payload = readPayload();
  if (!payload) return;
  const nodes = document.querySelectorAll('[data-open-now]');
  if (!nodes.length) return;

  const update = () => nodes.forEach((n) => render(n, payload));
  update();
  // раз на хвилину достатньо: межі роботи кратні 30 хвилинам
  setInterval(update, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') update();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

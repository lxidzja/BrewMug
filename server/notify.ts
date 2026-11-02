/**
 * Сповіщення власнику про заявку.
 * Канали незалежні: якщо один впав, інші все одно намагаються відправити,
 * а помилка НЕ скасовує вже збережену заявку (запис у БД — головне).
 */
export interface NotifyEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  WEBHOOK_URL?: string; // універсальний канал (Slack/ntfy/власний бот)
}

export interface NotifyResult {
  channel: string;
  ok: boolean;
  error?: string;
}

/** Telegram MarkdownV2 вимагає екранування цих символів. */
export function escapeTelegram(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (m) => '\\' + m);
}

export async function notify(env: NotifyEnv, text: string): Promise<NotifyResult[]> {
  const out: NotifyResult[] = [];

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: escapeTelegram(text),
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
        }),
      });
      out.push({ channel: 'telegram', ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
    } catch (e) {
      out.push({ channel: 'telegram', ok: false, error: String(e) });
    }
  }

  if (env.WEBHOOK_URL) {
    try {
      const res = await fetch(env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      out.push({ channel: 'webhook', ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
    } catch (e) {
      out.push({ channel: 'webhook', ok: false, error: String(e) });
    }
  }

  if (!out.length) out.push({ channel: 'none', ok: false, error: 'канали не налаштовані' });
  return out;
}

export function bookingMessage(b: {
  name: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  wishes: string;
}): string {
  return [
    'Нова заявка на столик',
    `Імʼя: ${b.name}`,
    `Телефон: ${b.phone}`,
    `Дата: ${b.date} о ${b.time}`,
    `Гостей: ${b.guests}`,
    b.wishes ? `Побажання: ${b.wishes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function contactMessage(c: { name: string; phone: string; message: string }): string {
  return ['Нове звернення з сайту', `Імʼя: ${c.name}`, c.phone ? `Телефон: ${c.phone}` : '', `Текст: ${c.message}`]
    .filter(Boolean)
    .join('\n');
}

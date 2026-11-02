/**
 * Поліпшення форми бронювання (прогресивне: без JS форма теж працює через звичайний POST).
 *  - кнопки «1…6+» встановлюють кількість гостей;
 *  - при зміні дати підтягує вільні години з /api/availability;
 *  - клієнтська перевірка полів із фокусом на першій помилці;
 *  - відправка через fetch із повідомленням на сторінці.
 *
 * Скрипт підключається з компонента, тому ініціалізація чекає DOM, якщо він ще не готовий.
 */
import { normalizePhone, fmtDateUk } from '../lib/validation';

function init() {
  const form = document.querySelector<HTMLFormElement>('[data-booking-form]');
  if (!form) return;

  const dateInput = form.querySelector<HTMLInputElement>('[data-availability-date]');
  const timesWrap = form.querySelector<HTMLElement>('[data-times]');
  const guestsInput = form.querySelector<HTMLInputElement>('.guests-field input[name="guests"]');
  const status = form.querySelector<HTMLElement>('[data-form-status]');
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  const setStatus = (state: 'ok' | 'error' | 'info' | '', text: string) => {
    if (!status) return;
    status.dataset.state = state;
    status.textContent = text;
  };

  const setError = (input: Element | null, message: string) => {
    if (!(input instanceof HTMLElement)) return;
    input.setAttribute('aria-invalid', 'true');
    const id = input.id + '-err';
    let p = document.getElementById(id);
    if (!p) {
      p = document.createElement('p');
      p.id = id;
      p.className = 'error';
      input.after(p);
    }
    p.textContent = message;
    input.setAttribute('aria-describedby', id);
  };

  const clearError = (input: Element | null) => {
    if (!(input instanceof HTMLElement)) return;
    input.removeAttribute('aria-invalid');
    const p = document.getElementById(input.id + '-err');
    if (p) p.remove();
  };

  const validate = (): HTMLElement | null => {
    const name = form.querySelector<HTMLInputElement>('input[name="name"]');
    const phone = form.querySelector<HTMLInputElement>('input[name="phone"]');
    const time = form.querySelector<HTMLInputElement>('input[name="time"]:checked');
    let firstBad: HTMLElement | null = null;
    for (const el of [name, phone, dateInput, guestsInput]) if (el) clearError(el);

    if (!name || name.value.trim().length < 2) {
      setError(name, 'Вкажіть імʼя (щонайменше 2 літери)');
      firstBad ??= name;
    }
    if (!phone || !normalizePhone(phone.value)) {
      setError(phone, 'Телефон у форматі +380 XX XXX XX XX');
      firstBad ??= phone;
    }
    if (!dateInput || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) {
      setError(dateInput, 'Оберіть дату');
      firstBad ??= dateInput;
    }
    const guests = Number(guestsInput?.value ?? 0);
    if (!Number.isInteger(guests) || guests < 1) {
      setError(guestsInput, 'Вкажіть кількість гостей');
      firstBad ??= guestsInput;
    }
    if (!time) {
      setStatus('error', 'Оберіть вільний час. Зайняті години перекреслені.');
      firstBad ??= timesWrap;
    }
    return firstBad;
  };

  // кнопки кількості гостей
  form.querySelectorAll<HTMLButtonElement>('[data-guests-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (guestsInput) {
        guestsInput.value = btn.dataset.guestsChoice ?? '1';
        clearError(guestsInput);
      }
      form.querySelectorAll<HTMLButtonElement>('[data-guests-choice]').forEach((b) => {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
    });
  });

  // швидкий вибір дати
  form.querySelectorAll<HTMLAnchorElement>('[data-quick-date]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (!dateInput) return;
      dateInput.value = a.dataset.quickDate ?? '';
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      dateInput.focus();
      form.querySelectorAll<HTMLAnchorElement>('[data-quick-date]').forEach((el) =>
        el.classList.toggle('is-active', el === a),
      );
    });
  });

  // вільні години для обраної дати
  let lastRequest = 0;
  async function loadSlots(date: string) {
    if (!timesWrap || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const reqId = ++lastRequest;
    timesWrap.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch('/api/availability?date=' + encodeURIComponent(date));
      if (reqId !== lastRequest) return;
      if (!res.ok) throw new Error('bad response');
      const data = (await res.json()) as { slots: { time: string; available: boolean }[] };
      const previous = form?.querySelector<HTMLInputElement>('input[name="time"]:checked')?.value;

      timesWrap.replaceChildren(
        ...data.slots.map((s) => {
          const label = document.createElement('label');
          label.className = 'chip' + (s.available ? '' : ' is-busy');
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = 'time';
          input.value = s.time;
          input.disabled = !s.available;
          if (s.time === previous && s.available) {
            input.checked = true;
            label.classList.add('is-selected');
          }
          const span = document.createElement('span');
          span.textContent = s.time;
          label.append(input, span);
          if (!s.available) {
            const sr = document.createElement('span');
            sr.className = 'sr-only';
            sr.textContent = ' — зайнято';
            label.append(sr);
          }
          return label;
        }),
      );

      const anyFree = data.slots.some((s) => s.available);
      setStatus(
        anyFree ? '' : 'info',
        anyFree ? '' : `На ${fmtDateUk(date)} вільних годин немає. Оберіть інший день або залиште звернення.`,
      );
    } catch {
      setStatus('info', 'Не вдалося завантажити вільні години. Ми перевіримо час під час підтвердження.');
    } finally {
      timesWrap.removeAttribute('aria-busy');
    }
  }

  dateInput?.addEventListener('change', () => {
    if (!dateInput) return;
    clearError(dateInput);
    void loadSlots(dateInput.value);
  });

  // підсвічування вибраного часу
  form.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'radio' || t.name !== 'time') return;
    form.querySelectorAll<HTMLElement>('.times .chip').forEach((c) => c.classList.remove('is-selected'));
    t.closest('.chip')?.classList.add('is-selected');
    setStatus('', '');
  });

  // відправка
  form.addEventListener('submit', async (e) => {
    const bad = validate();
    if (bad) {
      e.preventDefault();
      (bad.closest('fieldset') ?? bad).focus?.();
      bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    e.preventDefault();
    if (submit) {
      submit.disabled = true;
      submit.dataset.label = submit.textContent ?? '';
      submit.textContent = 'Надсилаємо…';
    }
    setStatus('info', 'Надсилаємо заявку…');

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: new FormData(form),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        errors?: Record<string, string>;
        alternatives?: string[];
      };

      if (res.status === 409) {
        setStatus('error', `${data.error ?? 'На цей час місць немає'}. Вільні: ${(data.alternatives ?? []).join(', ')}`);
        if (dateInput) void loadSlots(dateInput.value);
        return;
      }
      if (!res.ok) {
        const msg = data.errors
          ? Object.values(data.errors).join(' ')
          : (data.error ?? 'Не вдалося надіслати заявку');
        setStatus('error', msg);
        return;
      }

      setStatus('ok', data.message ?? 'Заявку прийнято. Зателефонуємо протягом 15 хвилин.');
      form.reset();
      if (guestsInput) guestsInput.value = '2';
      // повертаємо узгоджений стан: 2 гості, обрана дата, перечитані слоти
      form.querySelectorAll<HTMLButtonElement>('[data-guests-choice]').forEach((b) =>
        b.setAttribute('aria-pressed', b.getAttribute('data-guests-choice') === '2' ? 'true' : 'false'),
      );
      form.querySelectorAll<HTMLElement>('.chip').forEach((c) => c.classList.remove('is-selected'));
      if (dateInput) {
        const okText = status?.textContent ?? '';
        void loadSlots(dateInput.value).then(() => setStatus('ok', okText));
      }
    } catch {
      setStatus('error', 'Немає зв’язку з сервером. Спробуйте ще раз або зателефонуйте.');
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = submit.dataset.label ?? 'Підтвердити бронювання';
      }
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

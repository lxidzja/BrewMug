/**
 * Повідомлення про успішне надсилання звернення.
 * Після POST із редіректом (?sent=1) показуємо блок подяки й прокручуємо до форми.
 * Прапорець читаємо з data-атрибута, щоб не залежати від умовного рендерингу в шаблоні.
 */
function init() {
  const host = document.querySelector<HTMLElement>('[data-contact-sent]');
  const notice = document.querySelector<HTMLElement>('[data-sent-notice]');
  if (!host || !notice) return;

  const sent = new URLSearchParams(window.location.search).get('sent') === '1';
  if (!sent) return;

  notice.hidden = false;
  // прибираємо параметр, щоб повідомлення не з'являлося після перезавантаження
  const url = new URL(window.location.href);
  url.searchParams.delete('sent');
  url.hash = '#form';
  window.history.replaceState({}, '', url.toString());

  const form = document.getElementById('form');
  if (form) form.scrollIntoView({ block: 'start' });
  notice.focus?.();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

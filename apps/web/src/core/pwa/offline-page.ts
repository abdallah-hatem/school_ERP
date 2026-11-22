import { APP_THEME } from '@school-erp/shared';
import { dirFor, getCommonMessages, type Locale } from '@/shared/lib/i18n';

/** Where the service worker keeps the offline page of each language (`/offline.html?lang=…`). */
export function offlinePath(locale: Locale): string {
  return `/offline.html?lang=${locale}`;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/**
 * The offline page's own Content-Security-Policy (it is a route handler, outside the proxy that
 * sets the pages' one): nothing but its inline style, its data: icon and its one nonce'd script.
 * The service worker keeps the page with this header, so the stored nonce still matches.
 */
export function offlinePageCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The page the service worker shows when a page can't load because the device is offline
 * (owner, 2026-11-21): the school's name and icon, "You're offline", Try again — in the visitor's
 * language. Self-contained (inline style, the icon as a data URL) because it is shown with no
 * network, and holding nothing personal, so the service worker may keep it. It reloads by itself
 * when the connection comes back.
 */
export function offlineHtml(input: {
  locale: Locale;
  schoolName: string;
  iconDataUrl: string | null;
  /** The response's CSP nonce (`offlinePageCsp`): the page's one script carries it. */
  nonce?: string;
}): string {
  const { locale, schoolName, iconDataUrl, nonce } = input;
  const t = getCommonMessages(locale).pwa.offline;
  const font =
    locale === 'ar'
      ? "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, system-ui, sans-serif"
      : "'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif";
  const icon = iconDataUrl
    ? `<img src="${iconDataUrl}" alt="" width="72" height="72" class="icon">`
    : '<span class="icon"></span>';
  return `<!doctype html>
<html lang="${locale}" dir="${dirFor(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${APP_THEME.themeColor}">
<title>${escapeHtml(`${t.title} · ${schoolName}`)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px;
    background: ${APP_THEME.backgroundColor}; color: #11302b; font-family: ${font}; }
  main { width: 100%; max-width: 420px; background: #fff; border-radius: 28px; padding: 32px 24px;
    box-shadow: 0 1px 2px rgb(17 48 43 / 0.06), 0 8px 24px -12px rgb(17 48 43 / 0.18); text-align: center; }
  .icon { display: block; width: 72px; height: 72px; margin: 0 auto 12px; border-radius: 20px; background: ${APP_THEME.themeColor}; }
  .school { margin: 0 0 20px; font-size: 0.875rem; color: #587069; font-weight: 600; }
  h1 { margin: 0 0 8px; font-size: 1.375rem; font-weight: 800; }
  p { margin: 0 0 24px; line-height: 1.6; color: #587069; }
  button { font: inherit; font-weight: 700; min-height: 44px; padding: 0 22px; border: 0; border-radius: 14px;
    background: ${APP_THEME.themeColor}; color: #fff; cursor: pointer; }
  button:focus-visible { outline: 3px solid rgb(11 122 104 / 0.55); outline-offset: 2px; }
</style>
</head>
<body>
<main>
  ${icon}
  <p class="school">${escapeHtml(schoolName)}</p>
  <h1>${escapeHtml(t.title)}</h1>
  <p>${escapeHtml(t.body)}</p>
  <button type="button" id="retry">${escapeHtml(t.retry)}</button>
</main>
<script${nonce ? ` nonce="${escapeHtml(nonce)}"` : ''}>
  document.getElementById('retry').addEventListener('click', function () { location.reload(); });
  window.addEventListener('online', function () { location.reload(); });
</script>
</body>
</html>`;
}

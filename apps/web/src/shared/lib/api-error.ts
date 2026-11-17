import type { Translate } from './i18n';

/**
 * The text for a failed API call, in the screen's language: the `errors.<CODE>` translation when the
 * screen loads the `errors` namespace and knows the code, else the server's own message (which
 * follows the `lang` cookie and can differ from the page's language).
 */
export function apiErrorText(
  response: { error?: unknown; message?: unknown },
  i18n: { t: Translate; has: (key: string) => boolean },
): string {
  const key = typeof response.error === 'string' ? `errors.${response.error}` : null;
  if (key && i18n.has(key)) return i18n.t(key);
  return typeof response.message === 'string' ? response.message : '';
}

import type { Translate, TranslateValues } from './i18n';

/** The values the API sent for its error's message (`params`, e.g. `{ count }` minutes left). */
function paramsOf(response: { params?: unknown }): TranslateValues | undefined {
  const p = response.params;
  if (!p || typeof p !== 'object') return undefined;
  const out: TranslateValues = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}

/**
 * The text for a failed API call, in the screen's language: the `errors.<CODE>` translation when the
 * screen loads the `errors` namespace and knows the code — filled with the error's `params`, so a
 * plural message ("Try again in 12 minutes.") picks its form — else the server's own message (which
 * follows the `lang` cookie and can differ from the page's language).
 */
export function apiErrorText(
  response: { error?: unknown; message?: unknown; params?: unknown },
  i18n: { t: Translate; has: (key: string) => boolean },
): string {
  const key = typeof response.error === 'string' ? `errors.${response.error}` : null;
  if (key && i18n.has(key)) return i18n.t(key, paramsOf(response));
  return typeof response.message === 'string' ? response.message : '';
}

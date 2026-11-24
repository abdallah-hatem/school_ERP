import { WORK_SYSTEMS, type WorkSystem } from '@school-erp/shared';
import { apiErrorText } from '@/shared/lib/api-error';
import type { Locale, Translate } from '@/shared/lib/i18n';

/**
 * A refused template or print request in the screen's language: `errors.<CODE>` with its params —
 * a work system read by its name ("Another template became the default for Full-time…") — else the
 * server's message, else `fallback`.
 */
export function templateErrorText(
  res: { error?: unknown; message?: unknown; params?: unknown },
  i18n: { t: Translate; has: (key: string) => boolean; locale: Locale },
  fallback: string,
): string {
  const params = (res.params ?? null) as Record<string, unknown> | null;
  const ws = params?.workSystem;
  if (res.error === 'TEMPLATE_DEFAULT_TAKEN') {
    const name = WORK_SYSTEMS.includes(ws as WorkSystem) ? i18n.t(`common.enums.workSystem.${ws as string}`) : '';
    return i18n.t('errors.TEMPLATE_DEFAULT_TAKEN', { workSystem: name });
  }
  return apiErrorText(res, i18n) || fallback;
}

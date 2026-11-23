'use client';

import type { PenaltyRecountChange } from '@school-erp/shared';
import { formatCount } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { recountItem } from '../lib/penalty-text';

/**
 * §4 backdated penalty (owner 2026-11-20): the approved penalties approving this one moves up —
 * "Approving this will raise the level of 2 approved penalties:" then one line each ("19 Nov 2026:
 * level 1 → 2, Deduct 0.5 day → Deduct 1 day") and a note. Spans only: it also sits inside a
 * dialog's description paragraph (the approve confirmation). Penalties in stages the user doesn't
 * see are only counted (`elsewhere`, security review L1): no date or level of them is shown.
 */
export function RecountList({
  recount,
  elsewhere = 0,
  note,
  className,
}: {
  recount: PenaltyRecountChange[];
  elsewhere?: number;
  note: string;
  className?: string;
}) {
  const { t, locale } = useTranslation();
  const total = recount.length + elsewhere;
  if (total === 0) return null;
  return (
    <span
      data-testid="penalty-recount"
      className={cn('flex flex-col gap-1.5 rounded-xl bg-warning-soft px-3.5 py-3 text-start text-sm text-warning-ink', className)}
    >
      <span className="font-bold">{t('penalties.recount.heading', { count: formatCount(total) })}</span>
      {recount.length > 0 ? (
        <span role="list" aria-label={t('penalties.recount.label')} className="flex flex-col gap-1">
          {recount.map((change) => (
            <span role="listitem" key={change.id} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span className="min-w-0 break-words tabular">{recountItem(change, t, locale)}</span>
            </span>
          ))}
        </span>
      ) : null}
      {elsewhere > 0 ? (
        <span data-testid="penalty-recount-elsewhere">{t('penalties.recount.elsewhere', { count: formatCount(elsewhere) })}</span>
      ) : null}
      <span className="text-xs">{note}</span>
    </span>
  );
}

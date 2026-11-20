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
 * dialog's description paragraph (the approve confirmation).
 */
export function RecountList({
  recount,
  note,
  className,
}: {
  recount: PenaltyRecountChange[];
  note: string;
  className?: string;
}) {
  const { t, locale } = useTranslation();
  if (recount.length === 0) return null;
  return (
    <span
      data-testid="penalty-recount"
      className={cn('flex flex-col gap-1.5 rounded-xl bg-warning-soft px-3.5 py-3 text-start text-sm text-warning-ink', className)}
    >
      <span className="font-bold">{t('penalties.recount.heading', { count: formatCount(recount.length) })}</span>
      <span role="list" aria-label={t('penalties.recount.label')} className="flex flex-col gap-1">
        {recount.map((change) => (
          <span role="listitem" key={change.id} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span className="min-w-0 break-words tabular">{recountItem(change, t, locale)}</span>
          </span>
        ))}
      </span>
      <span className="text-xs">{note}</span>
    </span>
  );
}

'use client';

import { monthOf } from '@school-erp/shared';
import { useSearchParams } from 'next/navigation';
import { I18nProvider, useTranslation } from '@/shared/providers/i18n-provider';
import { LatenessBoard } from './lateness-board';
import { resolveMonth } from './lateness-month';
import { latenessMessages } from './messages';

/**
 * First load of the lateness screen: the board itself with skeleton rows (same header, toolbar,
 * columns and row heights), so nothing moves when the month arrives.
 */
export function LatenessSkeleton() {
  const { locale } = useTranslation();
  const params = useSearchParams();
  const current = monthOf(new Date());
  return (
    <I18nProvider messages={latenessMessages(locale)}>
      <LatenessBoard
        month={resolveMonth(params.get('month') ?? undefined, current)}
        maxMonth={current}
        rows={undefined}
        rule={undefined}
        locked={false}
      />
    </I18nProvider>
  );
}

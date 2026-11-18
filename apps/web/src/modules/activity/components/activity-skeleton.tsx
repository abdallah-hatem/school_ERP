'use client';

import { useSearchParams } from 'next/navigation';
import { AuditI18n } from '@/core/audit';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { parseActivityQuery } from '../lib/query';
import { ActivityView } from './activity-view';

/**
 * The Activity page while it loads: the page itself in its loading state — header, search, the
 * count line, a page of the timeline (10 entries under day headers), the pagination and the
 * filters panel with today's figures as bars — so nothing moves when it lands. It renders before
 * the page's messages are known, so it brings them.
 */
export function ActivitySkeleton() {
  const { locale } = useTranslation();
  const params = useSearchParams();
  return (
    <AuditI18n locale={locale}>
      <ActivityView
        basePath={`/${locale}/activity`}
        query={parseActivityQuery(Object.fromEntries(params))}
        entries={undefined}
        total={0}
        actors={[]}
        summary={undefined}
        now={new Date().toISOString()}
      />
    </AuditI18n>
  );
}

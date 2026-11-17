import { monthOf, type Month } from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/dashboard.json';
import en from '@school-erp/shared/locales/en/dashboard.json';
import { Suspense } from 'react';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { DashboardHeader, DashboardSkeleton, DashboardView } from './dashboard-view';
import { loadDashboard } from './load-dashboard';

const MESSAGES: Record<Locale, MessageTree> = {
  en: { dashboard: en } as unknown as MessageTree,
  ar: { dashboard: ar } as unknown as MessageTree,
};

/** The dashboard namespace for a locale (the screen and tests nest it over the base messages). */
export function dashboardMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

async function DashboardFigures({ month }: { month: Month }) {
  const data = await loadDashboard();
  return <DashboardView data={data} month={month} />;
}

/**
 * Server: the greeting renders at once; the figures stream in behind a skeleton of their shape.
 * A Suspense boundary here rather than a route `loading.tsx`, which would also wrap every screen
 * nested under the dashboard group.
 */
export function DashboardScreen({ locale }: { locale: Locale }) {
  const month = monthOf(new Date());
  return (
    <I18nProvider messages={dashboardMessages(locale)}>
      <div className="flex flex-col gap-5">
        <DashboardHeader month={month} />
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardFigures month={month} />
        </Suspense>
      </div>
    </I18nProvider>
  );
}

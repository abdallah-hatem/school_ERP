import { monthOf, parseAnalyticsRange, type AnalyticsRange, type Month } from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/dashboard.json';
import en from '@school-erp/shared/locales/en/dashboard.json';
import { headers } from 'next/headers';
import { userAgent } from 'next/server';
import { Suspense } from 'react';
import { can, getSession } from '@/core/auth';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { AnalyticsSection, ChartsError } from './charts/analytics-section';
import { AnalyticsSkeleton } from './charts/analytics-skeleton';
import { AnalyticsRangeProvider } from './charts/range-switch';
import { hasTrends } from './charts/trends';
import { dashboardLinks } from './dashboard-links';
import { seesDashboardFigures } from './dashboard-tiles';
import { DashboardHeader, DashboardSkeleton, DashboardView } from './dashboard-view';
import { loadAnalytics, loadDashboard } from './load-dashboard';
import { WelcomeView } from './welcome-view';

const MESSAGES: Record<Locale, MessageTree> = {
  en: { dashboard: en } as unknown as MessageTree,
  ar: { dashboard: ar } as unknown as MessageTree,
};

/** The dashboard namespace for a locale (the screen and tests nest it over the base messages). */
export function dashboardMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

/** The figures (only reached with `hr.dashboard.view` and a tile to show; otherwise Home is the welcome). */
async function DashboardFigures({ month, charts }: { month: Month; charts?: React.ReactNode }) {
  return <DashboardView data={await loadDashboard()} month={month} charts={charts} />;
}

/** The header once the charts' figures are in: the range switch shows only when there are trends. */
async function HeaderWithRange({ month, range }: { month: Month; range: AnalyticsRange }) {
  const data = await loadAnalytics(range);
  return <DashboardHeader month={month} range={!data || hasTrends(data)} />;
}

/** The charts, streamed on their own behind their skeleton. */
async function DashboardCharts({ locale, month, range }: { locale: Locale; month: Month; range: AnalyticsRange }) {
  const data = await loadAnalytics(range);
  if (!data) return <ChartsError />;
  return <AnalyticsSection data={data} payrollHref={dashboardLinks(locale, data.latestApproved ?? month).payroll} />;
}

/** Phones open on 6 months, wider screens on 12 (owner, 2026-11-21); `?months=` overrides. */
async function defaultRange(): Promise<AnalyticsRange> {
  const device = userAgent({ headers: await headers() }).device.type;
  return device === 'mobile' ? 6 : 12;
}

/**
 * Server: with `hr.dashboard.view`, the greeting renders at once; the figures stream in behind a skeleton of their shape.
 * A Suspense boundary here rather than a route `loading.tsx`, which would also wrap every screen
 * nested under the dashboard group. With `hr.dashboard.view_analytics` (System admin only at the
 * start, owner 2026-11-21) the charts stream in on their own between the tiles and the quick
 * links, and the header carries the 6 / 12 months switch; without it the page is as before.
 */
export async function DashboardScreen({ locale, months }: { locale: Locale; months?: string | string[] }) {
  const session = await getSession();
  // Without `hr.dashboard.view` — or with it but none of the tiles' view permissions, which would
  // leave a bare greeting — Home is a welcome with links to the viewer's screens (§2): no figures
  // fetched, so nothing to stream and no skeleton.
  if (!seesDashboardFigures(session)) {
    return (
      <I18nProvider messages={dashboardMessages(locale)}>
        <WelcomeView />
      </I18nProvider>
    );
  }
  const month = monthOf(new Date());
  if (!can(session, 'hr.dashboard.view_analytics')) {
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
  const range = parseAnalyticsRange(months) ?? (await defaultRange());
  return (
    <I18nProvider messages={dashboardMessages(locale)}>
      <AnalyticsRangeProvider range={range}>
        <div className="flex flex-col gap-5">
          <Suspense fallback={<DashboardHeader month={month} range />}>
            <HeaderWithRange month={month} range={range} />
          </Suspense>
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardFigures
              month={month}
              charts={
                <Suspense fallback={<AnalyticsSkeleton />}>
                  <DashboardCharts locale={locale} month={month} range={range} />
                </Suspense>
              }
            />
          </Suspense>
        </div>
      </AnalyticsRangeProvider>
    </I18nProvider>
  );
}

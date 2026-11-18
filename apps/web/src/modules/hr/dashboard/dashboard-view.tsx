'use client';

import { PayrollStatus, type HrDashboard, type Month } from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { canAny, useCan, useSession, type PermissionRequirement } from '@/core/auth';
import { useSchoolBranding } from '@/core/settings';
import { ErrorState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import {
  AddIcon,
  ChevronEndIcon,
  EmployeesIcon,
  LatenessIcon,
  PayrollIcon,
  PendingIcon,
  PenaltiesIcon,
  ReadyIcon,
  SettingsIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';
import { Skeleton, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatTile, StatTileSubSkeleton } from '@/shared/components/ui/stat-tile';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatCount, formatMoney, formatMonth } from '@/shared/lib/format';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { dashboardLinks, type DashboardLinks } from './dashboard-links';

/** Phone 2×2 (1 column below 360px), tablet 2, desktop 4. */
const TILE_GRID = 'grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 xl:grid-cols-4';

/** Greeting with the school's name and the month the figures are for. */
export function DashboardHeader({ month }: { month: Month }) {
  const { t, locale } = useTranslation();
  const { branding } = useSchoolBranding();
  return (
    <PageHeader
      title={t('dashboard.greeting', { school: nameIn(branding, locale) })}
      description={t('dashboard.description', { month: formatMonth(month, locale) })}
    />
  );
}

function CtaLine({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-bold text-primary">
      {children}
      <ChevronEndIcon className="flip-rtl size-3.5" />
    </span>
  );
}

/**
 * Which tiles the viewer gets (R6): each needs the view permission of what it counts. The API
 * sends null for a widget the viewer can't see; the skeleton uses the same rule, so nothing shifts.
 */
export interface DashboardTilesShown {
  headcount: boolean;
  payroll: boolean;
  penalties: boolean;
}

export function useTilesShown(): DashboardTilesShown {
  const can = useCan();
  return {
    headcount: can('hr.employees.view'),
    payroll: can('hr.payroll.view'),
    penalties: can('hr.penalties.view'),
  };
}

const anyTile = (shown: DashboardTilesShown) => shown.headcount || shown.payroll || shown.penalties;

function DashboardTiles({ data, month, links }: { data: HrDashboard; month: Month; links: DashboardLinks }) {
  const { t, locale } = useTranslation();
  const shown = useTilesShown();
  const { headcount, currentRun, penaltiesThisMonth } = data;
  const monthLabel = formatMonth(month, locale);
  if (!anyTile(shown)) return null;
  return (
    <section aria-label={t('dashboard.tilesLabel')} data-skeleton-block="tiles" className={TILE_GRID}>
      {headcount && shown.headcount ? (
      <StatTile
        tone="feature"
        icon={EmployeesIcon}
        href={links.employees}
        label={t('dashboard.headcount.label')}
        value={formatCount(headcount.active)}
        sub={
          headcount.byStage.length ? (
            <ul aria-label={t('dashboard.headcount.byStage')} className="flex flex-wrap gap-x-3 gap-y-1">
              {headcount.byStage.map(({ stage, count }) => (
                <li key={stage.id} className="flex min-w-0 items-baseline gap-1">
                  <span className="truncate">{nameIn(stage, locale)}</span>
                  <bdi dir="ltr" className="tabular font-bold text-primary-foreground">
                    {formatCount(count)}
                  </bdi>
                </li>
              ))}
            </ul>
          ) : (
            t('dashboard.headcount.none')
          )
        }
      />
      ) : null}
      {!shown.payroll ? null : currentRun ? (
        <StatTile
          tone="primary"
          icon={PayrollIcon}
          href={links.payroll}
          label={t('dashboard.payroll.label', { month: monthLabel })}
          // The run's net, unless the viewer may not see it (R7): then its status alone.
          unit={currentRun.net === undefined ? undefined : t('ui.units.currency')}
          value={currentRun.net === undefined ? <span aria-label={t('ui.units.amountHidden')}>—</span> : formatMoney(currentRun.net)}
          sub={
            <span className="flex flex-wrap items-center gap-2">
              <StatusPill
                tone={currentRun.status === PayrollStatus.APPROVED ? 'success' : 'accent'}
                icon={currentRun.status === PayrollStatus.APPROVED ? ReadyIcon : PendingIcon}
              >
                {t(`common.enums.payrollStatus.${currentRun.status}`)}
              </StatusPill>
              <CtaLine>{t('dashboard.payroll.open')}</CtaLine>
            </span>
          }
        />
      ) : (
        <StatTile
          tone="primary"
          icon={PayrollIcon}
          href={links.payroll}
          label={t('dashboard.payroll.label', { month: monthLabel })}
          value={<span className="font-display text-xl font-extrabold">{t('dashboard.payroll.none')}</span>}
          sub={<CtaLine>{t('dashboard.payroll.create')}</CtaLine>}
        />
      )}
      {penaltiesThisMonth && shown.penalties ? (
      <>
      <StatTile
        tone={penaltiesThisMonth.pending > 0 ? 'warning' : 'info'}
        icon={PenaltiesIcon}
        href={links.pendingPenalties}
        label={t('dashboard.penalties.pending')}
        value={formatCount(penaltiesThisMonth.pending)}
        sub={t('dashboard.penalties.pendingSub')}
      />
      <StatTile
        tone="info"
        icon={PenaltiesIcon}
        href={links.approvedPenalties}
        label={t('dashboard.penalties.approved')}
        value={formatCount(penaltiesThisMonth.approved)}
        sub={t('dashboard.penalties.approvedSub')}
      />
      </>
      ) : null}
    </section>
  );
}

/** Each quick link shows only to someone who may do what it leads to (R6). */
const QUICK_LINKS: {
  key: string;
  icon: AppIcon;
  href: (l: DashboardLinks) => string;
  anyOf: readonly PermissionRequirement[];
}[] = [
  { key: 'addEmployee', icon: AddIcon, href: (l) => l.newEmployee, anyOf: ['hr.employees.create'] },
  { key: 'recordPenalty', icon: PenaltiesIcon, href: (l) => l.penalties, anyOf: ['hr.penalties.record'] },
  { key: 'enterLateness', icon: LatenessIcon, href: (l) => l.lateness, anyOf: ['hr.lateness.edit'] },
  { key: 'runPayroll', icon: PayrollIcon, href: (l) => l.payroll, anyOf: ['hr.payroll.create'] },
  {
    key: 'settings',
    icon: SettingsIcon,
    href: (l) => l.settings,
    anyOf: ['core.settings.view', 'hr.settings.view', 'hr.lists.view', 'core.stages.view', 'hr.penalty_catalogue.view'],
  },
];

function useQuickLinks() {
  const user = useSession();
  return QUICK_LINKS.filter((link) => canAny(user, link.anyOf));
}
const QUICK_GRID = 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5';
const QUICK_ITEM = 'h-auto min-h-12 justify-start py-3 text-start whitespace-normal';

function QuickLinksFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="dashboard-quick-links" data-skeleton-block="quick-links" className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-card">
      <h2 id="dashboard-quick-links" className="font-display text-base font-extrabold">
        {t('dashboard.quickLinks.title')}
      </h2>
      <div className={QUICK_GRID}>{children}</div>
    </section>
  );
}

function QuickLinks({ links }: { links: DashboardLinks }) {
  const { t } = useTranslation();
  const quick = useQuickLinks();
  if (quick.length === 0) return null;
  return (
    <QuickLinksFrame>
      {quick.map(({ key, icon: Icon, href }) => (
        <Button key={key} asChild variant="secondary" className={QUICK_ITEM}>
          <Link href={href(links)}>
            <Icon className="size-5 text-primary" />
            {t(`dashboard.quickLinks.${key}`)}
          </Link>
        </Button>
      ))}
    </QuickLinksFrame>
  );
}

export interface DashboardViewProps {
  /** `null` when the figures failed to load; `undefined` when the viewer can't see them (no `hr.dashboard.view`). */
  data: HrDashboard | null | undefined;
  /** The month the figures are for (this month). */
  month: Month;
}

/** The figures under the header: tiles and quick links, or an error with a retry. */
export function DashboardView({ data, month }: DashboardViewProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const links = dashboardLinks(locale, data?.currentRun?.month ?? month, data?.currentRun?.id);

  return (
    <>
      {data === undefined ? null : data ? (
        <DashboardTiles data={data} month={data.currentRun?.month ?? month} links={links} />
      ) : (
        <div className="rounded-3xl bg-card shadow-card">
          <ErrorState
            title={t('dashboard.error.title')}
            description={t('dashboard.error.body')}
            retrying={retrying}
            onRetry={() => startRetry(() => router.refresh())}
          />
        </div>
      )}
      <QuickLinks links={links} />
    </>
  );
}

/** First load: the tiles and quick links in their final shape, nothing that shifts. */
export function DashboardSkeleton() {
  const { t } = useTranslation();
  const shown = useTilesShown();
  const seesFigures = useCan()('hr.dashboard.view') && anyTile(shown);
  const quick = useQuickLinks();
  return (
    // `contents`: the tiles and quick links stay direct items of the screen's column, as loaded.
    <div aria-busy="true" className="contents">
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      {seesFigures ? (
      <div data-skeleton-block="tiles" className={TILE_GRID}>
        {shown.headcount ? (
        <StatTile
          tone="feature"
          icon={EmployeesIcon}
          label={t('dashboard.headcount.label')}
          value={null}
          loading
          // Stages over two lines (four in a half-width phone tile); the row stretches to the tallest.
          sub={<StatTileSubSkeleton lines={2} narrowLines={4} gapped feature />}
        />
        ) : null}
        {shown.payroll ? (
        <StatTile
          tone="primary"
          icon={PayrollIcon}
          label={<SkeletonText width="w-36" />}
          value={null}
          loading
          sub={<Skeleton className="h-6 w-36 rounded-full" />}
        />
        ) : null}
        {shown.penalties ? (
        <>
        <StatTile
          tone="info"
          icon={PenaltiesIcon}
          label={t('dashboard.penalties.pending')}
          value={null}
          loading
          sub={<StatTileSubSkeleton narrowLines={2} />}
        />
        <StatTile
          tone="info"
          icon={PenaltiesIcon}
          label={t('dashboard.penalties.approved')}
          value={null}
          loading
          sub={<StatTileSubSkeleton narrowLines={2} />}
        />
        </>
        ) : null}
      </div>
      ) : null}
      {quick.length > 0 ? (
        <QuickLinksFrame>
          {quick.map(({ key }) => (
            <Skeleton key={key} className="h-12 rounded-lg" />
          ))}
        </QuickLinksFrame>
      ) : null}
    </div>
  );
}

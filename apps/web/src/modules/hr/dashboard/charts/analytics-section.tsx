'use client';

import type { AnalyticsDeductionPart, DeductionPart, HrDashboardAnalytics, Piastres } from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type ReactNode } from 'react';
import { ErrorState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { ChartIcon, ChevronEndIcon, PayrollIcon, PendingIcon, ReadyIcon, TableIcon } from '@/shared/components/ui/icons';
import { formatCount, formatMoney, formatMoneyText, formatMonth, formatMonthShort, formatPercent } from '@/shared/lib/format';
import type { Locale } from '@/shared/lib/i18n';
import { nameIn } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { ChartLegend, ChartTable, TimeBarChart, TimeLineChart, textWidth, useElementSize, type TooltipContent } from './chart-kit';
import { useAnalyticsRange } from './range-switch';
import { hasTrends } from './trends';

/** The 2×2 grid (one column on phones and tablets). */
export const CHART_GRID = 'grid grid-cols-1 gap-5 xl:grid-cols-2';
/** A chart card's frame. */
export const CHART_CARD = 'flex min-w-0 flex-col gap-3.5 rounded-3xl bg-card p-4 shadow-card sm:px-5.5 sm:py-5';

const S1 = 'var(--series-1)';
const S1_MUTED = 'var(--series-1-muted)';
const S2 = 'var(--series-2)';
const S3 = 'var(--series-3)';
const S4 = 'var(--series-4)';

type T = ReturnType<typeof useTranslation>['t'];

/** `1,284,500` EGP → `1.3M` / `1.3 مليون`; `48,000` → `48K`. Latin digits in both languages. */
function compact(value: number, t: T): string {
  const a = Math.abs(value);
  if (a >= 1e6) return t('dashboard.charts.compact.million', { n: (a / 1e6).toFixed(1).replace(/\.0$/, '') });
  if (a >= 1e4) return t('dashboard.charts.compact.thousand', { n: String(Math.round(a / 1e3)) });
  return formatCount(a);
}
const egp = (p: Piastres) => p / 100;
/** A signed amount for "vs previous month": `+12,000.00` / `−3,500.00`. */
const signedMoney = (p: Piastres) => `${p >= 0 ? '+' : '−'}${formatMoney(Math.abs(p))}`;
/** Counts below zero carry their minus sign (leavers). */
const signedCount = (v: number) => (v < 0 ? `−${formatCount(-v)}` : formatCount(v));

/** A card with a title, a line under it, a Table toggle, and the chart or the same numbers as a table. */
export function ChartCard({
  title,
  sub,
  legend,
  table,
  children,
  block,
}: {
  title: string;
  sub?: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  block: string;
}) {
  const { t } = useTranslation();
  const [tabled, setTabled] = useState(false);
  const bodyId = useId();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} data-skeleton-block={block} data-skeleton-measure="width" className={CHART_CARD}>
      <ChartCardHeader
        titleId={titleId}
        title={title}
        sub={sub}
        action={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-pressed={tabled}
            aria-controls={bodyId}
            title={t(tabled ? 'dashboard.charts.showChart' : 'dashboard.charts.showTable')}
            onClick={() => setTabled((v) => !v)}
            className="tap-target h-8 shrink-0 gap-1.5 rounded-[11px] px-2.5 text-xs text-muted-foreground"
          >
            {tabled ? <ChartIcon className="size-4" /> : <TableIcon className="size-4" />}
            {t(tabled ? 'dashboard.charts.chart' : 'dashboard.charts.table')}
          </Button>
        }
      />
      <div id={bodyId} className="flex min-w-0 flex-1 flex-col gap-3.5">
        {tabled ? (
          table
        ) : (
          <>
            {legend}
            {children}
          </>
        )}
      </div>
    </section>
  );
}

export function ChartCardHeader({ titleId, title, sub, action }: { titleId?: string; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="font-display text-base leading-snug font-extrabold">
          {title}
        </h2>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** A heading inside a card, between two charts. */
function SubHead({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="-mb-1 flex items-center gap-2 text-sm font-bold">
      {children}
      {note ? <small className="text-xs font-medium text-muted-foreground">{note}</small> : null}
    </div>
  );
}
const Divider = () => <div aria-hidden="true" className="h-px bg-border" />;

/* ---------------- payroll cost ---------------- */

function PayrollCard({ data, locale }: { data: HrDashboardAnalytics; locale: Locale }) {
  const { t } = useTranslation();
  const payroll = data.payroll!;
  const latest = data.latestApproved;
  const latestIndex = latest ? data.months.indexOf(latest) : -1;
  const latestNet = latestIndex >= 0 ? payroll[latestIndex]!.net : null;
  const currency = t('ui.units.currency');
  const tooltip = (k: number): TooltipContent => {
    const p = payroll[k]!;
    if (p.net === null) return { title: formatMonth(p.month, locale), rows: [{ label: t('dashboard.charts.noRun'), value: '—' }] };
    return {
      title: formatMonth(p.month, locale),
      rows: [
        { color: k === latestIndex ? S1 : S1_MUTED, label: t('dashboard.charts.payroll.net'), value: formatMoneyText(p.net, locale, currency) },
        { label: t('dashboard.charts.payroll.employees'), value: formatCount(p.employees ?? 0) },
        { label: t('dashboard.charts.payroll.change'), value: p.change === null ? '—' : signedMoney(p.change) },
      ],
    };
  };
  return (
    <ChartCard
      block="chart-payroll"
      title={t('dashboard.charts.payroll.title')}
      sub={t('dashboard.charts.payroll.sub')}
      table={
        <ChartTable
          caption={t('dashboard.charts.payroll.title')}
          head={[t('dashboard.charts.month'), `${t('dashboard.charts.payroll.net')} (${currency})`, t('dashboard.charts.payroll.employees')]}
          rows={payroll.map((p) => [formatMonth(p.month, locale), p.net === null ? '—' : formatMoney(p.net), p.employees === null ? '—' : formatCount(p.employees)])}
        />
      }
    >
      <TimeBarChart
        months={data.months}
        locale={locale}
        // Phones and tablets: a fixed height. Desktop: the card's full row height (beside Headcount).
        heightClass="h-[230px] xl:h-auto xl:min-h-[300px] xl:flex-1"
        ticks={3}
        yFormat={(v) => compact(egp(v), t)}
        ariaLabel={t('dashboard.charts.payroll.title')}
        hint={t('dashboard.charts.chartHint')}
        above={[{ values: payroll.map((p) => p.net), color: (k) => (k === latestIndex ? S1 : S1_MUTED) }]}
        cap={latestNet !== null ? { index: latestIndex, text: formatMoney(latestNet) } : undefined}
        tooltip={tooltip}
      />
    </ChartCard>
  );
}

/* ---------------- headcount ---------------- */

function StageBars({ data, locale }: { data: NonNullable<HrDashboardAnalytics['headcountByStage']>; locale: Locale }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.count));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <ul aria-label={t('dashboard.charts.headcount.title')} className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <li
          key={d.stage.id}
          tabIndex={0}
          onPointerEnter={() => setHover(i)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          className="relative grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-2.5 rounded-md text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55"
        >
          <span className="truncate font-semibold text-muted-foreground">{nameIn(d.stage, locale)}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={cn('h-3.5 shrink-0 rounded-e-[4px]', d.noStage ? 'bg-series-none' : 'bg-series-1')}
              style={{ width: `calc((100% - 2.5rem) * ${(d.count / max).toFixed(4)})` }}
            />
            <bdi dir="ltr" className="tabular text-sm font-bold">
              {formatCount(d.count)}
            </bdi>
          </span>
          {hover === i ? (
            <span role="tooltip" className="pointer-events-none absolute -top-1 end-0 z-10 -translate-y-full rounded-xl bg-popover px-3 py-2 text-xs shadow-raised ring-1 ring-border">
              <span className="me-2 font-extrabold">{nameIn(d.stage, locale)}</span>
              <bdi dir="ltr" className="tabular font-bold">
                {formatCount(d.count)} · {formatPercent(d.share)}
              </bdi>
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function stagesTable(data: NonNullable<HrDashboardAnalytics['headcountByStage']>, locale: Locale, t: T) {
  return (
    <ChartTable
      caption={t('dashboard.charts.headcount.title')}
      head={[t('dashboard.charts.headcount.stage'), t('dashboard.charts.headcount.count'), t('dashboard.charts.headcount.share')]}
      rows={data.map((d) => [nameIn(d.stage, locale), formatCount(d.count), formatPercent(d.share)])}
    />
  );
}

function HeadcountCard({ data, locale, trends }: { data: HrDashboardAnalytics; locale: Locale; trends: boolean }) {
  const { t } = useTranslation();
  const stages = data.headcountByStage!;
  const flow = trends ? data.flow : null;
  return (
    <ChartCard
      block="chart-headcount"
      title={t('dashboard.charts.headcount.title')}
      sub={t('dashboard.charts.headcount.sub')}
      table={
        <>
          {stagesTable(stages, locale, t)}
          {flow ? (
            <ChartTable
              caption={t('dashboard.charts.flow.title')}
              head={[t('dashboard.charts.month'), t('dashboard.charts.flow.joiners'), t('dashboard.charts.flow.leavers'), t('dashboard.charts.flow.headEnd')]}
              rows={flow.map((f) => [formatMonth(f.month, locale), formatCount(f.joiners), formatCount(f.leavers), formatCount(f.headcountEnd)])}
            />
          ) : null}
        </>
      }
    >
      <StageBars data={stages} locale={locale} />
      {flow ? (
        <>
          <Divider />
          <SubHead>{t('dashboard.charts.flow.title')}</SubHead>
          <ChartLegend
            items={[
              { color: S1, label: t('dashboard.charts.flow.joiners') },
              { color: S2, label: t('dashboard.charts.flow.leavers') },
            ]}
          />
          <TimeBarChart
            months={data.months}
            locale={locale}
            heightClass="h-[150px]"
            padTop={20}
            yFormat={signedCount}
            step={niceCountStep(flow.map((f) => f.joiners + f.leavers))}
            ariaLabel={t('dashboard.charts.flow.title')}
            hint={t('dashboard.charts.chartHint')}
            above={[{ values: flow.map((f) => f.joiners), color: S1 }]}
            below={[{ values: flow.map((f) => f.leavers), color: S2 }]}
            tooltip={(k) => ({
              title: formatMonth(flow[k]!.month, locale),
              rows: [
                { color: S1, label: t('dashboard.charts.flow.joiners'), value: formatCount(flow[k]!.joiners) },
                { color: S2, label: t('dashboard.charts.flow.leavers'), value: formatCount(flow[k]!.leavers) },
                { label: t('dashboard.charts.flow.headEnd'), value: formatCount(flow[k]!.headcountEnd) },
              ],
            })}
          />
        </>
      ) : null}
    </ChartCard>
  );
}

/** Whole-number steps for count axes: 1, 2, 5, 10… so a tick never reads 2.5 people. */
function niceCountStep(spans: number[]): number {
  const max = Math.max(1, ...spans);
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000]) if (max / s <= 4) return s;
  return Math.ceil(max / 4);
}

/* ---------------- penalties and lateness ---------------- */

function PenaltiesCard({ data, locale }: { data: HrDashboardAnalytics; locale: Locale }) {
  const { t } = useTranslation();
  const penalties = data.penalties;
  const lateness = data.lateness;
  const last = data.months.length - 1;
  const unit = t('dashboard.charts.lateness.unit');
  return (
    <ChartCard
      block="chart-penalties"
      title={t(penalties ? 'dashboard.charts.penalties.title' : 'dashboard.charts.lateness.title')}
      sub={penalties ? t('dashboard.charts.penalties.sub') : t('dashboard.charts.lateness.sub')}
      legend={
        penalties ? (
          <ChartLegend
            items={[
              { color: S1, label: t('dashboard.charts.penalties.notice') },
              { color: S2, label: t('dashboard.charts.penalties.deduct') },
              { color: S3, label: t('dashboard.charts.penalties.rest') },
            ]}
          />
        ) : undefined
      }
      table={
        <>
          {penalties ? (
            <ChartTable
              caption={t('dashboard.charts.penalties.title')}
              head={[
                t('dashboard.charts.month'),
                t('dashboard.charts.penalties.notice'),
                t('dashboard.charts.penalties.deduct'),
                t('dashboard.charts.penalties.rest'),
                t('dashboard.charts.total'),
              ]}
              rows={penalties.map((p) => [formatMonth(p.month, locale), formatCount(p.notice), formatCount(p.deduct), formatCount(p.other), formatCount(p.total)])}
            />
          ) : null}
          {lateness ? (
            <ChartTable
              caption={t('dashboard.charts.lateness.title')}
              head={[t('dashboard.charts.month'), `${t('dashboard.charts.lateness.minutes')} (${unit})`]}
              rows={lateness.map((l) => [formatMonth(l.month, locale), formatCount(l.minutes)])}
            />
          ) : null}
        </>
      }
    >
      {penalties ? (
        <TimeBarChart
          months={data.months}
          locale={locale}
          heightClass="h-[160px] xl:h-[170px]"
          padTop={20}
          yFormat={(v) => formatCount(v)}
          step={niceCountStep(penalties.map((p) => p.total))}
          ariaLabel={t('dashboard.charts.penalties.title')}
          hint={t('dashboard.charts.chartHint')}
          above={[
            { values: penalties.map((p) => p.notice), color: S1 },
            { values: penalties.map((p) => p.deduct), color: S2 },
            { values: penalties.map((p) => p.other), color: S3 },
          ]}
          cap={penalties[last]!.total > 0 ? { index: last, text: formatCount(penalties[last]!.total) } : undefined}
          tooltip={(k) => ({
            title: formatMonth(penalties[k]!.month, locale),
            rows: [
              { color: S1, label: t('dashboard.charts.penalties.notice'), value: formatCount(penalties[k]!.notice) },
              { color: S2, label: t('dashboard.charts.penalties.deduct'), value: formatCount(penalties[k]!.deduct) },
              { color: S3, label: t('dashboard.charts.penalties.rest'), value: formatCount(penalties[k]!.other) },
              { label: t('dashboard.charts.total'), value: formatCount(penalties[k]!.total) },
            ],
          })}
        />
      ) : null}
      {lateness ? (
        <>
          {penalties ? (
            <>
              <Divider />
              <SubHead note={t('dashboard.charts.lateness.sub')}>{t('dashboard.charts.lateness.title')}</SubHead>
            </>
          ) : null}
          <TimeLineChart
            months={data.months}
            locale={locale}
            heightClass={penalties ? 'h-[130px]' : 'h-[230px]'}
            yFormat={(v) => compact(v, t)}
            values={lateness.map((l) => l.minutes)}
            color={S3}
            endText={formatCount(lateness[last]!.minutes)}
            ariaLabel={t('dashboard.charts.lateness.title')}
            hint={t('dashboard.charts.chartHint')}
            tooltip={(k) => ({
              title: formatMonth(lateness[k]!.month, locale),
              rows: [{ color: S3, label: t('dashboard.charts.lateness.minutes'), value: `${formatCount(lateness[k]!.minutes)} ${unit}` }],
            })}
          />
        </>
      ) : null}
    </ChartCard>
  );
}

/* ---------------- deductions vs net ---------------- */

const PART_COLOR: Record<DeductionPart, string> = { net: S1, insurance: S3, incomeTax: S2, penalties: S4 };
const PART_LABEL: Record<DeductionPart, string> = {
  net: 'dashboard.charts.deductions.net',
  insurance: 'dashboard.charts.deductions.insurance',
  incomeTax: 'dashboard.charts.deductions.incomeTax',
  penalties: 'dashboard.charts.deductions.penalties',
};

/** The month's gross as one bar in four parts, each share printed inside when it fits. */
function useSegmentedBar(parts: AnalyticsDeductionPart[]) {
  const { t } = useTranslation();
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<DeductionPart | null>(null);
  const avail = Math.max(0, width - 2 * (parts.length - 1));
  const printed = new Set<DeductionPart>();
  const bar = parts.map((p) => {
    const px = avail * p.share;
    const label = formatPercent(p.share);
    const fits = width > 0 && px >= textWidth(label, 12, 700) + 18;
    if (fits) printed.add(p.part);
    return { ...p, px, label, fits };
  });
  return {
    printed,
    node: (
      <div ref={ref} role="img" aria-label={t('dashboard.charts.deductions.title')} className="relative flex h-7 gap-0.5">
        {width > 0
          ? bar.map((p) =>
              p.amount > 0 ? (
                <div
                  key={p.part}
                  onPointerEnter={() => setHover(p.part)}
                  onPointerLeave={() => setHover(null)}
                  className={cn(
                    'flex h-full min-w-0 items-center rounded-[4px] text-xs font-bold whitespace-nowrap',
                    p.part === 'incomeTax' ? 'text-series-2-ink' : 'text-primary-foreground',
                  )}
                  style={{ flex: `0 0 ${p.px.toFixed(1)}px`, background: PART_COLOR[p.part] }}
                >
                  {p.fits ? <span className="tabular px-2">{p.label}</span> : null}
                </div>
              ) : null,
            )
          : null}
        {hover ? (
          <span role="tooltip" className="pointer-events-none absolute -top-2 start-0 z-10 -translate-y-full rounded-xl bg-popover px-3 py-2 text-xs shadow-raised ring-1 ring-border">
            <span className="me-2 font-extrabold">{t(PART_LABEL[hover])}</span>
            <bdi dir="ltr" className="tabular font-bold">
              {formatMoney(bar.find((b) => b.part === hover)!.amount)} · {bar.find((b) => b.part === hover)!.label}
            </bdi>
          </span>
        ) : null}
      </div>
    ),
  };
}

function DeductionsSnapshot({ parts }: { parts: AnalyticsDeductionPart[] }) {
  const { t } = useTranslation();
  const { node, printed } = useSegmentedBar(parts);
  return (
    <>
      {node}
      <ul className="grid grid-cols-2 gap-x-4.5 gap-y-2">
        {parts.map((p) => (
          <li key={p.part} className="grid grid-cols-[0.625rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-xs">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: PART_COLOR[p.part] }} />
            <span className="font-semibold text-muted-foreground">{t(PART_LABEL[p.part])}</span>
            <span className="col-start-2 flex items-baseline gap-1.5 text-sm font-bold">
              <bdi dir="ltr" className="tabular">
                {formatMoney(p.amount)}
              </bdi>
              {printed.has(p.part) ? null : (
                <small className="tabular font-semibold text-muted-foreground">
                  <bdi dir="ltr">{formatPercent(p.share)}</bdi>
                </small>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function DeductionTrend({ rows, locale }: { rows: NonNullable<HrDashboardAnalytics['deductionTrend']>; locale: Locale }) {
  const { t } = useTranslation();
  // The track's full width: a little above the largest share, so the bars compare.
  const scale = Math.max(0.05, ...rows.map((r) => r.share)) * 1.15;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <li
          key={r.month}
          title={`${formatMonth(r.month, locale)}: ${formatPercent(r.share)}`}
          className="grid grid-cols-[4rem_minmax(0,1fr)_3rem] items-center gap-2.5 text-xs"
        >
          <span className={cn('font-semibold', i === 0 ? 'text-foreground' : 'text-muted-foreground')}>{formatMonthShort(r.month, locale)}</span>
          <span className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
            {(['insurance', 'incomeTax', 'penalties'] as const).map((k) =>
              r[k] > 0 ? (
                <span key={k} className="h-full" style={{ width: `${((r[k] / scale) * 100).toFixed(2)}%`, background: PART_COLOR[k] }} />
              ) : null,
            )}
          </span>
          <bdi dir="ltr" className={cn('tabular text-end font-bold', i === 0 ? 'text-foreground' : 'text-muted-foreground')}>
            {formatPercent(r.share)}
          </bdi>
        </li>
      ))}
      <li className="sr-only">{t('dashboard.charts.deductions.trendSub')}</li>
    </ul>
  );
}

function DeductionsCard({ data, locale, trends }: { data: HrDashboardAnalytics; locale: Locale; trends: boolean }) {
  const { t } = useTranslation();
  const d = data.deductions;
  const trend = trends ? data.deductionTrend : null;
  const currency = t('ui.units.currency');
  const sub = d
    ? t('dashboard.charts.deductions.sub', { month: formatMonth(d.month, locale), amount: formatMoneyText(d.gross, locale, currency) })
    : t('dashboard.charts.deductions.subNone');
  return (
    <ChartCard
      block="chart-deductions"
      title={t('dashboard.charts.deductions.title')}
      sub={sub}
      table={
        <>
          {d ? (
            <ChartTable
              caption={t('dashboard.charts.deductions.title')}
              head={[t('dashboard.charts.deductions.part'), `${t('dashboard.charts.deductions.amount')} (${currency})`, t('dashboard.charts.deductions.share')]}
              rows={d.parts.map((p) => [t(PART_LABEL[p.part]), formatMoney(p.amount), formatPercent(p.share)])}
            />
          ) : null}
          {trend && trend.length ? (
            <ChartTable
              caption={t('dashboard.charts.deductions.trend')}
              head={[
                t('dashboard.charts.month'),
                t('dashboard.charts.deductions.insurance'),
                t('dashboard.charts.deductions.incomeTax'),
                t('dashboard.charts.deductions.penalties'),
                `${t('dashboard.charts.deductions.trendTotal')} (${currency})`,
                t('dashboard.charts.deductions.share'),
              ]}
              rows={trend.map((r) => [
                formatMonth(r.month, locale),
                formatPercent(r.insurance),
                formatPercent(r.incomeTax),
                formatPercent(r.penalties, 2),
                formatMoney(r.amount),
                formatPercent(r.share),
              ])}
            />
          ) : null}
        </>
      }
    >
      {d ? <DeductionsSnapshot parts={d.parts} /> : null}
      {trend && trend.length ? (
        <>
          <Divider />
          <SubHead note={t('dashboard.charts.deductions.trendSub')}>{t('dashboard.charts.deductions.trend')}</SubHead>
          <DeductionTrend rows={trend} locale={locale} />
        </>
      ) : null}
    </ChartCard>
  );
}

/* ---------------- empty state ---------------- */

function EmptyCharts({ data, locale, payrollHref }: { data: HrDashboardAnalytics; locale: Locale; payrollHref: string }) {
  const { t } = useTranslation();
  const one = data.approvedMonths === 1 ? data.latestApproved : null;
  return (
    <section
      data-skeleton-block="charts-empty"
      className="flex flex-col items-center gap-2.5 rounded-3xl bg-linear-to-b from-accent-soft to-card to-70% px-4.5 pt-6.5 pb-5.5 text-center shadow-card"
    >
      <svg viewBox="0 0 92 72" aria-hidden="true" className="h-18 w-23">
        <rect x="4" y="8" width="84" height="60" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <rect x="20" y="40" width="12" height="18" rx="3" fill={S1} />
        <rect x="40" y="30" width="12" height="28" rx="3" fill="none" stroke={S1_MUTED} strokeWidth="2" strokeDasharray="3 3" />
        <rect x="60" y="22" width="12" height="36" rx="3" fill="none" stroke={S1_MUTED} strokeWidth="2" strokeDasharray="3 3" />
        <circle cx="76" cy="12" r="9" className="fill-accent" />
        <path d="M72 12l3 3 5-6" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="stroke-accent-foreground" />
      </svg>
      <h2 className="mt-1 font-display text-lg leading-snug font-extrabold">{t('dashboard.charts.empty.title')}</h2>
      <p className="max-w-115 text-sm text-muted-foreground">
        {one ? t('dashboard.charts.empty.bodyOne', { month: formatMonth(one, locale) }) : t('dashboard.charts.empty.body')}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
        {one ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-success-ink">
            <ReadyIcon className="size-4" />
            {t('dashboard.charts.empty.done', { month: formatMonth(one, locale) })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-muted-foreground ring-[1.5px] ring-border ring-inset">
            <PendingIcon className="size-4" />
            {t('dashboard.charts.empty.none')}
          </span>
        )}
        <ChevronEndIcon aria-hidden="true" className="flip-rtl size-3.5 text-muted-foreground" />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-muted-foreground ring-[1.5px] ring-border ring-inset">
          <PendingIcon className="size-4" />
          {t('dashboard.charts.empty.todo')}
        </span>
      </div>
      <Button asChild variant="primary" className="mt-1.5">
        <Link href={payrollHref}>
          <PayrollIcon className="size-5" />
          {t('dashboard.charts.empty.cta')}
        </Link>
      </Button>
    </section>
  );
}


/** The charts' figures didn't arrive: an error with a retry, in the charts' place. */
export function ChartsError() {
  const { t } = useTranslation();
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <div className="rounded-3xl bg-card shadow-card">
      <ErrorState
        title={t('dashboard.error.title')}
        description={t('dashboard.error.body')}
        retrying={retrying}
        onRetry={() => startRetry(() => router.refresh())}
      />
    </div>
  );
}

/**
 * The charts between the tiles and the quick links (layout "A · Grid", owner 2026-11-21): payroll
 * cost, headcount, penalties and lateness, deductions vs net. Each card shows only when the API
 * sent its figures (null without the screen's permission). Under two approved months the trend
 * charts give way to a card saying so; the snapshots (headcount by stage, the month's deductions)
 * still show.
 */
export function AnalyticsSection({ data, payrollHref }: { data: HrDashboardAnalytics; payrollHref: string }) {
  const { t, locale } = useTranslation();
  const range = useAnalyticsRange();
  const trends = hasTrends(data);
  const cards = trends
    ? [
        data.payroll ? <PayrollCard key="payroll" data={data} locale={locale} /> : null,
        data.headcountByStage ? <HeadcountCard key="headcount" data={data} locale={locale} trends /> : null,
        data.penalties || data.lateness ? <PenaltiesCard key="penalties" data={data} locale={locale} /> : null,
        data.deductionTrend ? <DeductionsCard key="deductions" data={data} locale={locale} trends /> : null,
      ]
    : [
        data.headcountByStage ? <HeadcountCard key="headcount" data={data} locale={locale} trends={false} /> : null,
        data.deductions ? <DeductionsCard key="deductions" data={data} locale={locale} trends={false} /> : null,
      ];
  const shown = cards.filter((c): c is NonNullable<typeof c> => c !== null);
  return (
    <section
      aria-label={t('dashboard.charts.label')}
      aria-busy={range?.pending || undefined}
      data-testid="dashboard-charts"
      className={cn('flex flex-col gap-5 transition-opacity duration-150', range?.pending && 'opacity-60')}
    >
      {trends ? null : <EmptyCharts data={data} locale={locale} payrollHref={payrollHref} />}
      {shown.length ? (
        <div data-skeleton-block="charts" data-skeleton-measure="width" className={CHART_GRID}>
          {shown}
        </div>
      ) : null}
    </section>
  );
}


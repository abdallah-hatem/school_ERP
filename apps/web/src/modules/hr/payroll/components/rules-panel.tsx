'use client';

import { HR_SETTINGS_DEFAULTS, settingsHref, type IsoDateTime, type LatenessRule, type PayrollRunRules } from '@school-erp/shared';
import Link from 'next/link';
import { Can } from '@/core/auth';
import { Button } from '@/shared/components/ui/button';
import {
  BlockedIcon,
  DeductionsIcon,
  EmployeesIcon,
  ErrorIcon,
  LatenessIcon,
  PenaltiesIcon,
  SettingsIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';
import { SkeletonProse } from '@/shared/components/ui/skeleton';
import { formatCount, formatDateTime, formatDayCount } from '@/shared/lib/format';
import type { Locale, Translate } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * The HR rules the run comes with (`run.rules`, so a viewer without `hr.settings.view` sees them
 * too), with a link to change them for those who may. On a draft they are the rules behind every
 * figure ("Rules applied this month"). An approved run keeps the numbers it was approved with and
 * the run stores no copy of the rules, so for it (`approvedAt` set) the panel says these are
 * today's rules and when the run was calculated — never that they applied. Each card lists its
 * rule as bullets, one fact each (owner, 2026-11-24); "Edit in settings" lands on Settings → HR
 * rules → Payroll rules.
 */
export function RulesPanel({
  rules: loaded,
  approvedAt = null,
}: {
  /** `null` when the run came without them; `undefined` while the run loads (bars in their place). */
  rules: PayrollRunRules | null | undefined;
  /** Set for an APPROVED run. */
  approvedAt?: IsoDateTime | null;
}) {
  const { t, locale } = useTranslation();
  const approved = approvedAt !== null;
  // While the settings load: the rules worded with §7's defaults, each bullet a bar per line — the
  // same cards and bullets the loaded rules take.
  const loading = loaded === undefined;
  const rules = loaded ?? (loading ? HR_SETTINGS_DEFAULTS : null);
  return (
    <aside
      aria-labelledby="payroll-rules-title"
      data-skeleton-block="rules-panel"
      className="@container from-accent-soft to-card shadow-card flex flex-col gap-4 self-start rounded-3xl bg-linear-to-b to-35% p-5"
    >
      <div className="flex items-start gap-3">
        <span className="bg-accent text-accent-foreground grid size-11 shrink-0 place-items-center rounded-xl">
          <SettingsIcon className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="payroll-rules-title" className="font-display text-lg leading-snug font-extrabold">
            {approved ? t('payroll.rules.currentTitle') : t('payroll.rules.title')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {approved ? (
              loading ? (
                // While the run loads its date isn't known: the sentence as a bar per line.
                <SkeletonProse>{t('payroll.rules.currentBody', { date: formatDateTime(approvedAt, locale) })}</SkeletonProse>
              ) : (
                t('payroll.rules.currentBody', { date: formatDateTime(approvedAt, locale) })
              )
            ) : (
              t('payroll.rules.body')
            )}
          </p>
        </div>
      </div>
      {rules ? (
        <ul aria-hidden={loading || undefined} className="grid gap-2.5 @min-[640px]:grid-cols-2 @min-[960px]:grid-cols-3">
          <Rule
            loading={loading}
            icon={DeductionsIcon}
            title={t('payroll.rules.dayValue')}
            points={[
              t('payroll.rules.dayValueRule', { divisor: formatCount(rules.payroll.dayDivisor) }),
              t('payroll.rules.dayValueMonth'),
            ]}
          />
          <Rule
            loading={loading}
            icon={EmployeesIcon}
            title={t('payroll.rules.workSystem')}
            points={[
              t('payroll.rules.workSystemFullTime'),
              t('payroll.rules.workSystemPt4', { percent: rules.payroll.partTime.PART_TIME_4 }),
              t('payroll.rules.workSystemPt3', { percent: rules.payroll.partTime.PART_TIME_3 }),
              t('payroll.rules.workSystemPt2', { percent: rules.payroll.partTime.PART_TIME_2 }),
            ]}
          />
          <Rule
            loading={loading}
            icon={LatenessIcon}
            title={t('payroll.rules.lateness')}
            points={latenessPoints(rules.lateness, t, locale)}
          />
          <Rule
            loading={loading}
            icon={PenaltiesIcon}
            title={t('payroll.rules.penalties')}
            points={[
              t('payroll.rules.penaltiesRule'),
              t(`payroll.rules.penaltiesWindow.${rules.penalties.repetitionWindow}`),
            ]}
          />
          <Rule
            loading={loading}
            icon={BlockedIcon}
            title={t('payroll.rules.netFloor')}
            points={[t('payroll.rules.netFloorRule'), t('payroll.rules.netFloorReview')]}
          />
        </ul>
      ) : (
        <p
          role="alert"
          className="bg-warning-soft text-warning-ink flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm"
        >
          <ErrorIcon className="mt-0.5 size-4 shrink-0" />
          <span>{t('payroll.rules.error')}</span>
        </p>
      )}
      {/* Only for someone who may open Settings → HR rules (an Accountant would land on not-found). */}
      <Can permission="hr.settings.view">
        <Button asChild variant="soft" className="w-full cursor-pointer @min-[640px]:w-auto @min-[640px]:self-start">
          <Link href={settingsHref(locale, 'hrRules', 'payroll')}>
            <SettingsIcon />
            {t('payroll.rules.edit')}
          </Link>
        </Button>
      </Can>
    </aside>
  );
}

/** The lateness rule as bullets: the grace minutes (when any), each hour's step, then later hours. */
function latenessPoints(rule: LatenessRule, t: Translate, locale: Locale): string[] {
  const days = (value: number) => ({ dayCount: formatDayCount(value, locale) });
  const points = [...rule.steps]
    .sort((a, b) => a.hour - b.hour)
    .map((step) => t('payroll.rules.latenessStep', { hour: step.hour, ...days(step.days) }));
  points.push(t('payroll.rules.latenessExtra', days(rule.extraHourDays)));
  if (rule.graceMinutes > 0) points.unshift(t('lateness.ruleGrace', { count: formatCount(rule.graceMinutes) }));
  return points;
}

function Rule({ icon: Icon, title, points, loading = false }: { icon: AppIcon; title: string; points: string[]; loading?: boolean }) {
  return (
    <li className="border-border bg-card flex items-start gap-3 rounded-2xl border px-3.5 py-3">
      <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-lg">
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-bold">{title}</p>
        {/* The app's bullet list (as the penalty recount's): a dot, then the fact — on the right in Arabic. */}
        <ul className="text-muted-foreground flex flex-col gap-0.5 text-sm">
          {points.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden="true" className={loading ? 'invisible' : undefined}>
                •
              </span>
              <span className="min-w-0 break-words">{loading ? <SkeletonProse>{point}</SkeletonProse> : point}</span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

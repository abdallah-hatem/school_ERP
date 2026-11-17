'use client';

import type { HrSettings } from '@school-erp/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
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
import { formatCount } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { describeLatenessRule } from '../../lateness/describe-rule';

/**
 * "Rules applied this month": the live HR settings (GET /hr/settings) behind every figure on the
 * run page, with a link to change them. An approved run keeps the numbers it was approved with;
 * the panel always shows today's settings.
 */
export function RulesPanel({ settings, settingsHref }: { settings: HrSettings | null; settingsHref: string }) {
  const { t } = useTranslation();
  return (
    <aside
      aria-labelledby="payroll-rules-title"
      className="@container from-accent-soft to-card shadow-card flex flex-col gap-4 self-start rounded-3xl bg-linear-to-b to-35% p-5"
    >
      <div className="flex items-start gap-3">
        <span className="bg-accent text-accent-foreground grid size-11 shrink-0 place-items-center rounded-xl">
          <SettingsIcon className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="payroll-rules-title" className="font-display text-lg leading-snug font-extrabold">
            {t('payroll.rules.title')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('payroll.rules.body')}</p>
        </div>
      </div>
      {settings ? (
        <ul className="grid gap-2.5 @min-[640px]:grid-cols-2 @min-[960px]:grid-cols-3">
          <Rule icon={DeductionsIcon} title={t('payroll.rules.dayValue')}>
            {t('payroll.rules.dayValueRule', {
              divisor: formatCount(settings.payroll.dayDivisor),
            })}
          </Rule>
          <Rule icon={EmployeesIcon} title={t('payroll.rules.workSystem')}>
            {t('payroll.rules.workSystemRule', {
              pt4: settings.payroll.partTime.PART_TIME_4,
              pt3: settings.payroll.partTime.PART_TIME_3,
              pt2: settings.payroll.partTime.PART_TIME_2,
            })}
          </Rule>
          <Rule icon={LatenessIcon} title={t('payroll.rules.lateness')}>
            {describeLatenessRule(settings.lateness, t)}
          </Rule>
          <Rule icon={PenaltiesIcon} title={t('payroll.rules.penalties')}>
            {t('payroll.rules.penaltiesRule', {
              window: t(`common.enums.repetitionWindow.${settings.penalties.repetitionWindow}`),
            })}
          </Rule>
          <Rule icon={BlockedIcon} title={t('payroll.rules.netFloor')}>
            {t('payroll.rules.netFloorRule')}
          </Rule>
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
      <Button asChild variant="soft" className="w-full cursor-pointer @min-[640px]:w-auto @min-[640px]:self-start">
        <Link href={settingsHref}>
          <SettingsIcon />
          {t('payroll.rules.edit')}
        </Link>
      </Button>
    </aside>
  );
}

function Rule({ icon: Icon, title, children }: { icon: AppIcon; title: string; children: ReactNode }) {
  return (
    <li className="border-border bg-card flex items-start gap-3 rounded-2xl border px-3.5 py-3">
      <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-lg">
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-muted-foreground text-sm break-words">{children}</p>
      </div>
    </li>
  );
}

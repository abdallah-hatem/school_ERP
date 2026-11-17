'use client';

import { EmployeeStatus, type EmployeeSummary } from '@school-erp/shared';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { useCan } from '@/core/auth';
import { EmployeeLink } from '@/core/employees';
import { Button } from '@/shared/components/ui/button';
import { Money } from '@/shared/components/ui/figures';
import { EditIcon, ShowIcon, StageIcon } from '@/shared/components/ui/icons';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import type { StageBand } from '../lib/stage-band';
import { EmployeeAvatar } from '@/core/employees';
import { EmployeeStatusPill } from './employee-bits';

/*
 * The employee profile card (owner's pick, option B): a band coloured by stage with the stage and
 * code, a large avatar (photo, or the silhouette) over the band, name and job title, department and work system,
 * basic salary, and View / Edit. The skeleton below is built from the same frame so nothing moves
 * when the cards land.
 */

/** Literal classes per band so Tailwind generates them. */
const BAND_CLASSES: Record<StageBand | 'inactive', string> = {
  'band-1': 'bg-band-1 text-band-1-ink',
  'band-2': 'bg-band-2 text-band-2-ink',
  'band-3': 'bg-band-3 text-band-3-ink',
  'band-4': 'bg-band-4 text-band-4-ink',
  'band-neutral': 'bg-band-neutral text-band-neutral-ink',
  inactive: 'bg-band-inactive text-band-inactive-ink',
};

/** Grid of cards: 3 a row from a 900px-wide content area (a 1280px window), 2 from 620px, 1 below. */
export function EmployeeCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn('grid grid-cols-1 gap-4.5 @min-[620px]:grid-cols-2 @min-[900px]:grid-cols-3', className)}>
      {children}
    </ul>
  );
}

/** The card's fixed frame: band, avatar row, then `body`. Shared by the card and its skeleton. */
function CardFrame({
  band,
  bandClass,
  avatar,
  body,
  labelledBy,
  inactive = false,
}: {
  band: ReactNode;
  bandClass: string;
  avatar: ReactNode;
  body: ReactNode;
  labelledBy?: string;
  inactive?: boolean;
}) {
  return (
    <article
      aria-labelledby={labelledBy}
      data-inactive={inactive || undefined}
      className="flex h-full flex-col overflow-hidden rounded-[1.375rem] bg-card shadow-card"
    >
      <div className={cn('relative flex h-18.5 items-start justify-between gap-2 overflow-hidden px-4 py-3', bandClass)}>
        <span aria-hidden="true" className="pointer-events-none absolute -end-9 -top-13.5 size-30 rounded-full bg-card/28" />
        {band}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4.5 pb-4">
        <div className="relative z-1 -mt-7.5 flex items-end gap-3">{avatar}</div>
        {body}
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted px-2.5 py-2">
      <p className="text-[0.72rem] text-muted-foreground">{label}</p>
      <p className="truncate text-[0.8rem] font-bold" title={value}>
        {value}
      </p>
    </div>
  );
}

export function EmployeeCard({
  employee,
  band,
  href,
}: {
  employee: EmployeeSummary;
  band: StageBand;
  /** The profile, e.g. `/ar/employees/<id>`; Edit is `${href}/edit`. */
  href: string;
}) {
  const { t, locale } = useTranslation();
  const nameId = useId();
  const name = localName(employee, locale);
  const canEdit = useCan()('hr.employees.edit');
  const inactive = employee.status !== EmployeeStatus.ACTIVE;

  return (
    <CardFrame
      labelledBy={nameId}
      inactive={inactive}
      bandClass={BAND_CLASSES[inactive ? 'inactive' : band]}
      band={
        <>
          <span className="relative inline-flex min-w-0 items-center gap-1.5 rounded-full bg-card/75 px-2.5 py-0.5 text-[0.78rem] font-bold">
            <StageIcon className="size-4 shrink-0" />
            <span className="truncate">{localName(employee.stage, locale)}</span>
          </span>
          <span dir="ltr" className="tabular relative shrink-0 pt-0.5 text-xs font-semibold opacity-80">
            {employee.code}
          </span>
        </>
      }
      avatar={
        <>
          <EmployeeAvatar photoUrl={employee.photoUrl} size="lg" muted={inactive} className="ring-4 ring-card" />
          <span className="ms-auto mb-1">
            <EmployeeStatusPill status={employee.status} />
          </span>
        </>
      }
      body={
        <>
          <div className="min-w-0">
            <h3 id={nameId} className="font-display text-[1.1rem] leading-snug font-extrabold break-words">
              <EmployeeLink employeeId={employee.id} name={name} />
            </h3>
            <p className="truncate text-[0.8rem] text-muted-foreground">{localName(employee.jobTitle, locale)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Fact label={t('employees.columns.department')} value={localName(employee.department, locale)} />
            <Fact
              label={t('employees.columns.workSystem')}
              value={t(`common.enums.workSystem.${employee.workSystem}`)}
            />
          </div>
          {/* The salary only when the API sent it (R7: `hr.employees.view_salary`). */}
          {employee.salaryVisible ? (
            <div
              className={cn(
                'flex items-center justify-between gap-2 rounded-[0.875rem] px-3 py-2.5',
                inactive ? 'bg-secondary text-muted-foreground' : 'bg-primary-soft text-primary',
              )}
            >
              <span className="text-xs font-bold">{t('employees.columns.basicSalary')}</span>
              <Money value={employee.basicSalary} className="text-[1.06rem] font-extrabold" />
            </div>
          ) : null}
          <div className={cn('mt-auto grid gap-2', canEdit && 'grid-cols-2')}>
            <Button asChild size="sm" className="min-w-0">
              <Link href={href} aria-label={t('employees.card.viewLabel', { name })}>
                <ShowIcon />
                {t('employees.card.view')}
              </Link>
            </Button>
            {canEdit ? (
              <Button asChild size="sm" className="min-w-0">
                <Link href={`${href}/edit`} aria-label={t('employees.card.editLabel', { name })}>
                  <EditIcon />
                  {t('employees.card.edit')}
                </Link>
              </Button>
            ) : null}
          </div>
        </>
      }
    />
  );
}

/** One card's skeleton: the same frame and heights as `EmployeeCard`. */
export function EmployeeCardSkeleton() {
  const can = useCan();
  const salary = can('hr.employees.view_salary');
  const canEdit = can('hr.employees.edit');
  return (
    <CardFrame
      bandClass="bg-band-neutral"
      band={
        <>
          <Skeleton className="relative h-6 w-28 rounded-full bg-card/75" />
          <Skeleton className="relative mt-0.5 h-4 w-16 bg-card/60" />
        </>
      }
      avatar={
        <>
          <Skeleton className="size-16 rounded-[1.25rem] ring-4 ring-card" />
          <Skeleton className="ms-auto mb-1 h-6 w-14 rounded-full" />
        </>
      }
      body={
        <>
          <div className="flex flex-col gap-1.5 py-0.5">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-13.5 rounded-xl" />
            <Skeleton className="h-13.5 rounded-xl" />
          </div>
          {salary ? <Skeleton className="h-12 rounded-[0.875rem]" /> : null}
          <div className={cn('mt-auto grid gap-2', canEdit && 'grid-cols-2')}>
            <Skeleton className="h-9 rounded-lg" />
            {canEdit ? <Skeleton className="h-9 rounded-lg" /> : null}
          </div>
        </>
      }
    />
  );
}


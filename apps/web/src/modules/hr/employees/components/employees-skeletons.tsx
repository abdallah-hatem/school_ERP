'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Skeleton, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { EMPLOYEES_PAGE_SIZE } from '../lib/list-query';
import { EmployeeCardGrid, EmployeeCardSkeleton } from './employee-card';
import { DetailsCard, DetailsItem, ProfileTabs } from './employee-profile';

function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex flex-1 basis-64 flex-col gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex gap-2.5">
        {Array.from({ length: actions }, (_, i) => (
          <Skeleton key={i} className="h-11 w-36 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * The list's first load: header, toolbar and a full page of card skeletons in the same grid and
 * card shape, so nothing moves when the cards land.
 */
export function EmployeesListSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      <section aria-label={t('common.nav.employees')} aria-busy="true" className="flex min-w-0 flex-col gap-4.5">
        <span role="status" className="sr-only">
          {t('ui.states.loading')}
        </span>
        <div className="flex flex-col gap-3 rounded-[1.25rem] bg-card p-3.5 shadow-card">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="mx-1 h-5 w-24" />
        </div>
        <EmployeeCardGrid>
          {Array.from({ length: EMPLOYEES_PAGE_SIZE }, (_, i) => (
            <li key={i} className="min-w-0" data-testid="employee-card-skeleton">
              <EmployeeCardSkeleton />
            </li>
          ))}
        </EmployeeCardGrid>
        <Skeleton className="h-9 w-full max-w-md" />
      </section>
    </div>
  );
}

/** Each Details card's field labels, in order: `wide` spans both columns, `tall` is the salary line. */
const DETAILS_SKELETON: { title: string; className?: string; fields: { key: string; wide?: boolean; tall?: boolean }[] }[] = [
  {
    title: 'employees.sections.personal',
    className: 'lg:col-span-2',
    fields: [
      { key: 'nameEn' },
      { key: 'nameAr' },
      { key: 'nationalId' },
      { key: 'gender' },
      { key: 'dateOfBirth' },
      { key: 'phone' },
      { key: 'email' },
      { key: 'address', wide: true },
    ],
  },
  {
    title: 'employees.sections.job',
    fields: [
      { key: 'code' },
      { key: 'hireDate' },
      { key: 'stage' },
      { key: 'department' },
      { key: 'jobTitle' },
      { key: 'workSystem' },
      { key: 'manager', wide: true },
      { key: 'grade' },
      { key: 'fingerprintId' },
    ],
  },
  {
    title: 'employees.sections.contract',
    fields: [{ key: 'basicSalary', wide: true, tall: true }, { key: 'contractStart' }, { key: 'contractEnd' }, { key: 'usesBus' }],
  },
];

/** The Details tab while it loads: the real cards and labels, each value a bar in its line box. */
export function EmployeeDetailsSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      {DETAILS_SKELETON.map((card) => (
        <DetailsCard key={card.title} title={t(card.title)} className={card.className}>
          {card.fields.map((field) => (
            <DetailsItem key={field.key} label={t(`employees.fields.${field.key}`)} wide={field.wide}>
              <SkeletonText className={field.tall ? 'text-lg' : 'text-sm'} width={field.wide ? 'w-48' : 'w-28'} />
            </DetailsItem>
          ))}
        </DetailsCard>
      ))}
    </div>
  );
}

/**
 * First visit to a profile, before its layout has the employee: the header in its real shape
 * (breadcrumbs, title, status, code line, two actions), the real tab bar and the Details cards.
 * Tab switches never show it — the profile layout stays mounted and only the tab's skeleton shows.
 */
export function EmployeeProfileSkeleton() {
  const { t, locale } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const basePath = `/${locale}/employees`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<SkeletonText width="w-56" />}
        status={<SkeletonPill />}
        description={<SkeletonText width="w-72" />}
        breadcrumbs={[{ label: t('employees.title'), href: basePath }, { label: ' ' }]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        actions={
          <>
            <Skeleton className="h-11 w-28 rounded-lg" />
            <Skeleton className="h-11 w-36 rounded-lg" />
          </>
        }
      />
      <ProfileTabs profileHref={`${basePath}/${id}`} />
      <EmployeeDetailsSkeleton />
    </div>
  );
}

/** Form pages (new, edit): header with actions and the three section cards. */
export function EmployeePageSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      <HeaderSkeleton actions={2} />
      {[6, 6, 4].map((fields, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-card md:p-6">
          <Skeleton className="h-6 w-40" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: fields }, (_, j) => (
              <Skeleton key={j} className="h-15 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

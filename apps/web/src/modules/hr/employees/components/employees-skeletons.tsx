'use client';

import { EMPLOYEE_SALARY_FIELDS } from '@school-erp/shared';
import { useParams, usePathname } from 'next/navigation';
import { useCan } from '@/core/auth';
import { RecordHistorySkeleton } from '@/core/audit';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Skeleton, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { EMPLOYEES_PAGE_SIZE } from '../lib/list-query';
import { EmployeesI18n } from '../messages';
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
  // Most employees are not insured: the status alone, across the card.
  { title: 'employees.sections.insurance', fields: [{ key: 'insuranceStatus', wide: true }] },
  {
    title: 'employees.sections.bank',
    fields: [{ key: 'bankName' }, { key: 'bankAccountNumber' }, { key: 'iban', wide: true }],
  },
  {
    title: 'employees.sections.emergency',
    fields: [{ key: 'emergencyContactName' }, { key: 'emergencyContactRelationship' }, { key: 'emergencyContactPhone', wide: true }],
  },
  {
    title: 'employees.sections.qualification',
    fields: [{ key: 'highestDegree' }, { key: 'graduationYear' }, { key: 'major' }, { key: 'university' }],
  },
];

/** The Details tab while it loads: the real cards and labels, each value a bar in its line box. */
export function EmployeeDetailsSkeleton() {
  const { t } = useTranslation();
  // Without salaries (R7) the Details tab has no salary line and no bank card: neither has its skeleton.
  const salary = useCan()('hr.employees.view_salary');
  const cards = salary
    ? DETAILS_SKELETON
    : DETAILS_SKELETON.filter((card) => card.title !== 'employees.sections.bank').map((card) => ({
        ...card,
        fields: card.fields.filter((f) => !(EMPLOYEE_SALARY_FIELDS as readonly string[]).includes(f.key)),
      }));
  return (
    <div aria-busy="true" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      {cards.map((card) => (
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
 * (breadcrumbs, title, status, code line, two actions), the real tab bar and the opened tab's body —
 * the History timeline on `/history`, the Details cards otherwise. It renders above the profile
 * layout (no `employees` messages yet), so it brings its own. Tab switches never show it — the
 * profile layout stays mounted and only the tab's skeleton shows.
 */
export function EmployeeProfileSkeleton() {
  const { locale } = useTranslation();
  return (
    <EmployeesI18n locale={locale}>
      <ProfileSkeleton />
    </EmployeesI18n>
  );
}

function ProfileSkeleton() {
  const { t, locale } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const history = usePathname()?.endsWith('/history') ?? false;
  const basePath = `/${locale}/employees`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<SkeletonText width="w-56" />}
        leading={<Skeleton className="size-16 shrink-0 rounded-[1.25rem]" />}
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
      {history ? <RecordHistorySkeleton /> : <EmployeeDetailsSkeleton />}
    </div>
  );
}

/** Form pages (new, edit): header with actions, the photo card and the section cards. */
export function EmployeePageSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      <HeaderSkeleton actions={2} />
      {/* Photo: the avatar beside its text and buttons. */}
      <div className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-card md:p-6">
        <Skeleton className="h-6 w-24" />
        <div className="flex flex-wrap items-center gap-5">
          <Skeleton className="size-24 shrink-0 rounded-3xl" />
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-3">
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-11 w-40 rounded-lg" />
          </div>
        </div>
      </div>
      {/* Personal, job, pay and contract, insurance, bank, emergency contact, qualification. */}
      {[6, 6, 4, 1, 3, 3, 4].map((fields, i) => (
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

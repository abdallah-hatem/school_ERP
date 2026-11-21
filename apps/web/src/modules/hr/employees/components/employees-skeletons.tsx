'use client';

import { EMPLOYEE_SALARY_FIELDS, EmployeeStatus } from '@school-erp/shared';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useCan } from '@/core/auth';
import type { ReactNode } from 'react';
import { PageHeader } from '@/shared/components/layout/page-header';
import { DeactivateIcon, EditIcon } from '@/shared/components/ui/icons';
import { Skeleton, SkeletonButton, SkeletonMask, SkeletonPill, SkeletonProse, SkeletonText } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { parseEmployeesQuery } from '../lib/list-query';
import { EmployeesI18n } from '../messages';
import { EmployeeForm } from './employee-form';
import { DetailsCard, DetailsItem, ProfileTabs } from './employee-profile';
import { EmployeesList } from './employees-list';

/*
 * Route skeletons (`loading.tsx`). Each is built from the screen's own pieces in their loading
 * state, so it can't drift from the screen: e2e/23-skeletons*.spec.ts compares them block by block.
 * They render above the pages' messages, so each brings its own.
 */

/**
 * The list's first load: the list itself in its loading state — the real header, toolbar (search,
 * filters, count and Clear filters), a full page of card skeletons and the pagination — so nothing
 * moves when the cards land.
 */
export function EmployeesListSkeleton() {
  const { locale } = useTranslation();
  const params = useSearchParams();
  return (
    <EmployeesI18n locale={locale}>
      <EmployeesList
        basePath={`/${locale}/employees`}
        query={parseEmployeesQuery(Object.fromEntries(params))}
        rows={undefined}
        total={0}
        stages={[]}
      />
    </EmployeesI18n>
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
      { key: 'probationEnd' },
      { key: 'stage' },
      { key: 'department' },
      { key: 'jobTitle' },
      { key: 'workSystem' },
      { key: 'grade' },
      { key: 'manager', wide: true },
      { key: 'fingerprintId', wide: true },
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
 * (breadcrumbs, avatar, title, status, code line, two actions), the real tab bar and the opened
 * tab's `body` — the Details cards unless the route passes another tab's skeleton. Tab switches
 * never show it: the profile layout stays mounted and only the tab's own skeleton shows.
 */
export function EmployeeProfileSkeleton({ body }: { body?: ReactNode }) {
  const { locale } = useTranslation();
  return (
    <EmployeesI18n locale={locale}>
      <ProfileSkeleton body={body} />
    </EmployeesI18n>
  );
}

function ProfileSkeleton({ body }: { body?: ReactNode }) {
  const { t, locale } = useTranslation();
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const basePath = `/${locale}/employees`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<SkeletonText width="w-36 sm:w-56" />}
        leading={<Skeleton className="size-16 shrink-0 rounded-[1.25rem]" />}
        // An active employee, as most profiles opened are: the Active pill and Edit · Deactivate.
        status={<SkeletonPill>{t(`common.enums.employeeStatus.${EmployeeStatus.ACTIVE}`)}</SkeletonPill>}
        // The loaded header's two lines: code · job · department, then "Signs in as" / "No sign-in account".
        description={
          <span className="flex flex-col gap-1">
            <SkeletonText width="w-72" />
            <SkeletonText width="w-40" />
          </span>
        }
        breadcrumbs={[{ label: t('employees.title'), href: basePath }, { label: ' ' }]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        actions={
          can('hr.employees.edit') || can('hr.employees.change_status') ? (
            <>
              {can('hr.employees.edit') ? (
                <SkeletonButton>
                  <EditIcon />
                  {t('employees.profile.edit')}
                </SkeletonButton>
              ) : null}
              {can('hr.employees.change_status') ? (
                <SkeletonButton>
                  <DeactivateIcon />
                  {t('employees.status.deactivate')}
                </SkeletonButton>
              ) : null}
            </>
          ) : undefined
        }
      />
      <ProfileTabs profileHref={`${basePath}/${id}`} />
      {body ?? <EmployeeDetailsSkeleton />}
    </div>
  );
}

/**
 * Form pages (new, edit) while they load: the form itself under a skeleton mask — the photo card,
 * every section, field and hint, and the sticky Save bar in place, each control a pulsing block —
 * under a header whose text is a bar (the employee's name isn't known yet).
 */
export function EmployeePageSkeleton() {
  const { locale } = useTranslation();
  return (
    <EmployeesI18n locale={locale}>
      <FormSkeleton />
    </EmployeesI18n>
  );
}

function FormSkeleton() {
  const { t, locale } = useTranslation();
  const basePath = `/${locale}/employees`;
  const editing = usePathname()?.endsWith('/edit') ?? false;
  return (
    <SkeletonMask>
      <EmployeeForm
        basePath={basePath}
        editing={editing}
        header={
          <PageHeader
            title={<SkeletonText width="w-48" />}
            // The line the loaded header has, as bars, so it wraps where that one does.
            description={<SkeletonProse>{editing ? 'Xxxxxx Xxxxxxx Xxxxxxx · EMP-0000' : t('employees.create.description')}</SkeletonProse>}
            breadcrumbs={[{ label: t('employees.title'), href: basePath }, { label: ' ' }]}
            breadcrumbsLabel={t('ui.shell.breadcrumbs')}
          />
        }
      />
    </SkeletonMask>
  );
}

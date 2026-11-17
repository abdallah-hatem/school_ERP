'use client';

import type { Employee } from '@school-erp/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { Money } from '@/shared/components/ui/figures';
import { EditIcon } from '@/shared/components/ui/icons';
import { formatDate } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { EmployeeIdentity, EmployeeStatusPill } from './employee-bits';
import { EmployeeStatusAction } from './employee-status-action';

/**
 * The profile's sections. Each is a route under `/employees/[id]` (`''` = details). Penalties (T12)
 * and payroll (T14) add their entries here with their own pages.
 */
export const PROFILE_TABS = [{ key: 'details', labelKey: 'employees.profile.details', segment: '' }] as const satisfies readonly {
  key: string;
  labelKey: string;
  segment: string;
}[];
export type ProfileTabKey = (typeof PROFILE_TABS)[number]['key'];

/** Header (name, status, edit, deactivate / reactivate) and the section tabs, around a section's body. */
export function EmployeeProfileShell({
  basePath,
  employee,
  active,
  children,
}: {
  basePath: string;
  employee: Employee;
  active: ProfileTabKey;
  children: ReactNode;
}) {
  const { t, locale } = useTranslation();
  const href = `${basePath}/${employee.id}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={localName(employee, locale)}
        status={<EmployeeStatusPill status={employee.status} />}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <bdi dir="ltr" className="tabular">
              {employee.code}
            </bdi>
            <span aria-hidden="true">·</span>
            <span>{localName(employee.jobTitle, locale)}</span>
            <span aria-hidden="true">·</span>
            <span>{localName(employee.department, locale)}</span>
          </span>
        }
        breadcrumbs={[{ label: t('employees.title'), href: basePath }, { label: localName(employee, locale) }]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        actions={
          <>
            <Button asChild variant="primary">
              <Link href={`${href}/edit`}>
                <EditIcon />
                {t('employees.profile.edit')}
              </Link>
            </Button>
            <EmployeeStatusAction employee={employee} />
          </>
        }
      />
      <nav aria-label={t('employees.profile.tabs')} className="scrollbar-clean -mb-2 overflow-x-auto">
        <ul className="flex gap-1.5 border-b border-border">
          {PROFILE_TABS.map((tab) => {
            const current = tab.key === active;
            return (
              <li key={tab.key}>
                <Link
                  href={tab.segment ? `${href}/${tab.segment}` : href}
                  scroll={false}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    '-mb-px flex h-11 cursor-pointer items-center border-b-2 px-4 text-sm font-bold whitespace-nowrap transition-colors duration-150',
                    current ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(tab.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}

/** The "Details" section: every §3 field, grouped like the form. */
export function EmployeeDetails({ basePath, employee }: { basePath: string; employee: Employee }) {
  const { t, locale } = useTranslation();
  const notSet = <span className="text-muted-foreground">{t('employees.profile.notSet')}</span>;
  const text = (v: string | null) => (v ? v : notSet);
  const ltr = (v: string | null) =>
    v ? (
      <bdi dir="ltr" className="tabular">
        {v}
      </bdi>
    ) : (
      notSet
    );
  const date = (v: string) => (
    <bdi dir="ltr" className="tabular">
      {formatDate(v, locale)}
    </bdi>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <DetailsCard title={t('employees.sections.personal')} className="lg:col-span-2">
        <Item label={t('employees.fields.nameEn')}>
          <bdi dir="ltr">{employee.nameEn}</bdi>
        </Item>
        <Item label={t('employees.fields.nameAr')}>
          <bdi dir="rtl">{employee.nameAr}</bdi>
        </Item>
        <Item label={t('employees.fields.nationalId')}>{ltr(employee.nationalId)}</Item>
        <Item label={t('employees.fields.gender')}>{t(`common.enums.gender.${employee.gender}`)}</Item>
        <Item label={t('employees.fields.dateOfBirth')}>{date(employee.dateOfBirth)}</Item>
        <Item label={t('employees.fields.phone')}>{ltr(employee.phone)}</Item>
        <Item label={t('employees.fields.email')}>{ltr(employee.email)}</Item>
        <Item label={t('employees.fields.address')} wide>
          {text(employee.address)}
        </Item>
      </DetailsCard>
      <DetailsCard title={t('employees.sections.job')}>
        <Item label={t('employees.fields.code')}>{ltr(employee.code)}</Item>
        <Item label={t('employees.fields.hireDate')}>{date(employee.hireDate)}</Item>
        <Item label={t('employees.fields.stage')}>{localName(employee.stage, locale)}</Item>
        <Item label={t('employees.fields.department')}>{localName(employee.department, locale)}</Item>
        <Item label={t('employees.fields.jobTitle')}>{localName(employee.jobTitle, locale)}</Item>
        <Item label={t('employees.fields.workSystem')}>{t(`common.enums.workSystem.${employee.workSystem}`)}</Item>
        <Item label={t('employees.fields.manager')} wide>
          {employee.manager ? <EmployeeIdentity employee={employee.manager} href={`${basePath}/${employee.manager.id}`} /> : notSet}
        </Item>
        <Item label={t('employees.fields.grade')}>{text(employee.grade)}</Item>
        <Item label={t('employees.fields.fingerprintId')}>{ltr(employee.fingerprintId)}</Item>
      </DetailsCard>
      <DetailsCard title={t('employees.sections.contract')}>
        <Item label={t('employees.fields.basicSalary')} wide>
          <Money value={employee.basicSalary} className="text-lg font-extrabold text-primary" />
        </Item>
        <Item label={t('employees.fields.contractStart')}>{date(employee.contractStart)}</Item>
        <Item label={t('employees.fields.contractEnd')}>{date(employee.contractEnd)}</Item>
        <Item label={t('employees.fields.usesBus')}>{employee.usesBus ? t('common.common.yes') : t('common.common.no')}</Item>
      </DetailsCard>
    </div>
  );
}

function DetailsCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-card md:p-6', className)}>
      <h2 className="font-display text-lg font-extrabold">{title}</h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Item({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 rounded-xl bg-muted px-3.5 py-2.5', wide && 'sm:col-span-2')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold break-words">{children}</dd>
    </div>
  );
}

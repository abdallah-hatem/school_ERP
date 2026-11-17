'use client';

import type { Employee } from '@school-erp/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, type ReactNode } from 'react';
import { Can } from '@/core/auth';
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
 * The profile's sections. Each is a route under `/employees/[id]` (`''` = details), inside the
 * `(profile)` route group whose layout draws the header and these tabs once.
 */
export const PROFILE_TABS = [
  { key: 'details', labelKey: 'employees.profile.details', segment: '' },
  { key: 'penalties', labelKey: 'common.nav.penalties', segment: 'penalties' },
  { key: 'payroll', labelKey: 'common.nav.payroll', segment: 'payroll' },
] as const satisfies readonly {
  key: string;
  labelKey: string;
  segment: string;
}[];
export type ProfileTabKey = (typeof PROFILE_TABS)[number]['key'];

const ProfileEmployeeContext = createContext<Employee | null>(null);

/**
 * The employee the profile layout loaded, for a tab that needs more than its id. Tabs read it here
 * instead of fetching the employee again; it updates when the layout refreshes (after deactivate /
 * reactivate).
 */
export function useProfileEmployee(): Employee {
  const employee = useContext(ProfileEmployeeContext);
  if (!employee) throw new Error('useProfileEmployee must be used inside EmployeeProfileShell');
  return employee;
}

/** The tab a pathname shows: the first segment after `/employees/<id>` (none = details). */
export function activeProfileTab(pathname: string, profileHref: string): ProfileTabKey {
  const rest = pathname.startsWith(profileHref) ? pathname.slice(profileHref.length) : '';
  const segment = rest.split('/')[1] ?? '';
  return PROFILE_TABS.find((tab) => tab.segment === segment)?.key ?? 'details';
}

/** The section tabs. Each link prefetches its tab; the current one comes from the URL. */
export function ProfileTabs({ profileHref }: { profileHref: string }) {
  const { t } = useTranslation();
  const active = activeProfileTab(usePathname(), profileHref);
  return (
    <nav aria-label={t('employees.profile.tabs')} className="scrollbar-clean -mb-2 overflow-x-auto">
      <ul className="flex gap-1.5 border-b border-border">
        {PROFILE_TABS.map((tab) => {
          const current = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={tab.segment ? `${profileHref}/${tab.segment}` : profileHref}
                prefetch
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
  );
}

/**
 * Header (name, status, edit, deactivate / reactivate) and the section tabs, around a section's
 * body. The profile layout renders it once, so it stays mounted while the tabs change.
 */
export function EmployeeProfileShell({
  basePath,
  employee,
  children,
}: {
  basePath: string;
  employee: Employee;
  children: ReactNode;
}) {
  const { t, locale } = useTranslation();
  const href = `${basePath}/${employee.id}`;
  return (
    <ProfileEmployeeContext.Provider value={employee}>
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
              <Can permission="hr.employees.edit">
                <Button asChild variant="primary">
                  <Link href={`${href}/edit`}>
                    <EditIcon />
                    {t('employees.profile.edit')}
                  </Link>
                </Button>
              </Can>
              <Can permission="hr.employees.change_status">
                <EmployeeStatusAction employee={employee} />
              </Can>
            </>
          }
        />
        <ProfileTabs profileHref={href} />
        {children}
      </div>
    </ProfileEmployeeContext.Provider>
  );
}

/** The Details tab inside the profile layout: the layout's employee, no second fetch. */
export function ProfileEmployeeDetails({ basePath }: { basePath: string }) {
  return <EmployeeDetails basePath={basePath} employee={useProfileEmployee()} />;
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
    <bdi className="tabular">
      {formatDate(v, locale)}
    </bdi>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <DetailsCard title={t('employees.sections.personal')} className="lg:col-span-2">
        <DetailsItem label={t('employees.fields.nameEn')}>
          <bdi dir="ltr">{employee.nameEn}</bdi>
        </DetailsItem>
        <DetailsItem label={t('employees.fields.nameAr')}>
          <bdi dir="rtl">{employee.nameAr}</bdi>
        </DetailsItem>
        <DetailsItem label={t('employees.fields.nationalId')}>{ltr(employee.nationalId)}</DetailsItem>
        <DetailsItem label={t('employees.fields.gender')}>{t(`common.enums.gender.${employee.gender}`)}</DetailsItem>
        <DetailsItem label={t('employees.fields.dateOfBirth')}>{date(employee.dateOfBirth)}</DetailsItem>
        <DetailsItem label={t('employees.fields.phone')}>{ltr(employee.phone)}</DetailsItem>
        <DetailsItem label={t('employees.fields.email')}>{ltr(employee.email)}</DetailsItem>
        <DetailsItem label={t('employees.fields.address')} wide>
          {text(employee.address)}
        </DetailsItem>
      </DetailsCard>
      <DetailsCard title={t('employees.sections.job')}>
        <DetailsItem label={t('employees.fields.code')}>{ltr(employee.code)}</DetailsItem>
        <DetailsItem label={t('employees.fields.hireDate')}>{date(employee.hireDate)}</DetailsItem>
        <DetailsItem label={t('employees.fields.stage')}>{localName(employee.stage, locale)}</DetailsItem>
        <DetailsItem label={t('employees.fields.department')}>{localName(employee.department, locale)}</DetailsItem>
        <DetailsItem label={t('employees.fields.jobTitle')}>{localName(employee.jobTitle, locale)}</DetailsItem>
        <DetailsItem label={t('employees.fields.workSystem')}>{t(`common.enums.workSystem.${employee.workSystem}`)}</DetailsItem>
        <DetailsItem label={t('employees.fields.manager')} wide>
          {employee.manager ? <EmployeeIdentity employee={employee.manager} href={`${basePath}/${employee.manager.id}`} /> : notSet}
        </DetailsItem>
        <DetailsItem label={t('employees.fields.grade')}>{text(employee.grade)}</DetailsItem>
        <DetailsItem label={t('employees.fields.fingerprintId')}>{ltr(employee.fingerprintId)}</DetailsItem>
      </DetailsCard>
      <DetailsCard title={t('employees.sections.contract')}>
        <DetailsItem label={t('employees.fields.basicSalary')} wide>
          <Money value={employee.basicSalary} className="text-lg font-extrabold text-primary" />
        </DetailsItem>
        <DetailsItem label={t('employees.fields.contractStart')}>{date(employee.contractStart)}</DetailsItem>
        <DetailsItem label={t('employees.fields.contractEnd')}>{date(employee.contractEnd)}</DetailsItem>
        <DetailsItem label={t('employees.fields.usesBus')}>{employee.usesBus ? t('common.common.yes') : t('common.common.no')}</DetailsItem>
      </DetailsCard>
    </div>
  );
}

export function DetailsCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-card md:p-6', className)}>
      <h2 className="font-display text-lg font-extrabold">{title}</h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function DetailsItem({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 rounded-xl bg-muted px-3.5 py-2.5', wide && 'sm:col-span-2')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold break-words">{children}</dd>
    </div>
  );
}

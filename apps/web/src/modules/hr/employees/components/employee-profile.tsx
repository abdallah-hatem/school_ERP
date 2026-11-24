'use client';

import { EmployeeStatus, InsuranceStatus, type Employee, type PermissionKey } from '@school-erp/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, type ReactNode } from 'react';
import { Can, useCan } from '@/core/auth';
import { PersonAvatar } from '@/shared/components/ui/person-avatar';
import { PageHeader } from '@/shared/components/layout/page-header';
import { RecordTabs } from '@/shared/components/layout/record-tabs';
import { Button } from '@/shared/components/ui/button';
import { Money } from '@/shared/components/ui/figures';
import { EditIcon } from '@/shared/components/ui/icons';
import { formatDate } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { EmployeeIdentity, EmployeeStatusPill, OtherStageTags } from './employee-bits';
import { EmployeeStatusAction } from './employee-status-action';

/**
 * The profile's sections. Each is a route under `/employees/[id]` (`''` = details), inside the
 * `(profile)` route group whose layout draws the header and these tabs once.
 */
export const PROFILE_TABS = [
  { key: 'details', labelKey: 'employees.profile.details', segment: '' },
  // Each tab only for people who may read what it shows (R6); its page refuses the rest (not found).
  { key: 'contracts', labelKey: 'common.nav.contracts', segment: 'contracts', permission: 'hr.contracts.view' },
  { key: 'penalties', labelKey: 'common.nav.penalties', segment: 'penalties', permission: 'hr.penalties.view' },
  { key: 'payroll', labelKey: 'common.nav.payroll', segment: 'payroll', permission: 'hr.payroll.view' },
  // Who changed what on this employee (audit log, T30); only for people who may read the log.
  { key: 'history', labelKey: 'employees.profile.history', segment: 'history', permission: 'core.audit.view' },
] as const satisfies readonly {
  key: string;
  labelKey: string;
  segment: string;
  permission?: PermissionKey;
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

/**
 * The profile layout's employee, or null outside it — a tab's skeleton drawn on a first visit,
 * before the layout has loaded the employee.
 */
export function useProfileEmployeeIfLoaded(): Employee | null {
  return useContext(ProfileEmployeeContext);
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
  const can = useCan();
  const active = activeProfileTab(usePathname(), profileHref);
  const tabs = PROFILE_TABS.filter((tab) => !('permission' in tab) || can(tab.permission));
  return (
    <RecordTabs
      label={t('employees.profile.tabs')}
      recordHref={profileHref}
      tabs={tabs.map((tab) => ({ key: tab.key, label: t(tab.labelKey), segment: tab.segment }))}
      active={active}
    />
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
          leading={<PersonAvatar photoUrl={employee.photoUrl} gender={employee.gender} size="lg" muted={employee.status !== EmployeeStatus.ACTIVE} />}
          status={<EmployeeStatusPill status={employee.status} />}
          description={
            <span className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-x-2">
                <bdi dir="ltr" className="tabular">
                  {employee.code}
                </bdi>
                <span aria-hidden="true">·</span>
                <span>{localName(employee.jobTitle, locale)}</span>
                <span aria-hidden="true">·</span>
                <span>{localName(employee.department, locale)}</span>
              </span>
              <SignInAccountLine account={employee.signInAccount} />
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

/**
 * Who signs in as this employee: "Signs in as: <name>" or "No sign-in account". Everyone who sees
 * the employee reads it; the name links to the user page only for viewers who may open users.
 */
export function SignInAccountLine({ account }: { account: Employee['signInAccount'] }) {
  const { t, locale } = useTranslation();
  const canOpenUsers = useCan()('core.users.view');
  if (!account) return <span>{t('employees.profile.noAccount')}</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span>{t('employees.profile.signsInAs')}</span>
      {canOpenUsers ? (
        <Link
          href={`/${locale}/users/${account.id}`}
          className={cn(
            'tap-target cursor-pointer rounded-sm font-semibold break-words text-foreground decoration-2 underline-offset-3 transition-colors duration-150',
            'hover:text-primary hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
          )}
        >
          <bdi>{account.name}</bdi>
        </Link>
      ) : (
        <bdi className="font-semibold break-words text-foreground">{account.name}</bdi>
      )}
    </span>
  );
}

/** The Details tab inside the profile layout: the layout's employee, no second fetch. */
export function ProfileEmployeeDetails() {
  return <EmployeeDetails employee={useProfileEmployee()} />;
}

/** The "Details" section: every §3 field, grouped like the form. */
export function EmployeeDetails({ employee }: { employee: Employee }) {
  const { t, locale } = useTranslation();
  const notSet = <span className="text-muted-foreground">{t('employees.profile.notSet')}</span>;
  const insured = employee.insuranceStatus === InsuranceStatus.INSURED;
  const salary = employee.salaryVisible;
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
        <DetailsItem label={t('employees.fields.probationEnd')}>
          {employee.probationEnd ? date(employee.probationEnd) : t('employees.noProbation')}
        </DetailsItem>
        <DetailsItem label={t('employees.fields.stage')}>{localName(employee.stage, locale)}</DetailsItem>
        <DetailsItem label={t('employees.fields.department')}>{localName(employee.department, locale)}</DetailsItem>
        <DetailsItem label={t('employees.fields.jobTitle')}>{localName(employee.jobTitle, locale)}</DetailsItem>
        <DetailsItem label={t('employees.fields.workSystem')}>{t(`common.enums.workSystem.${employee.workSystem}`)}</DetailsItem>
        {/* Grade before the manager line and the fingerprint across: the two columns stay full. */}
        <DetailsItem label={t('employees.fields.grade')}>{text(employee.grade ? localName(employee.grade, locale) : null)}</DetailsItem>
        <DetailsItem label={t('employees.fields.otherStages')} wide>
          {employee.otherStages.length > 0 ? <OtherStageTags stages={employee.otherStages} /> : t('employees.otherStages.none')}
        </DetailsItem>
        <DetailsItem label={t('employees.fields.manager')} wide>
          {employee.manager ? <EmployeeIdentity employee={employee.manager} /> : notSet}
        </DetailsItem>
        <DetailsItem label={t('employees.fields.fingerprintId')} wide>
          {ltr(employee.fingerprintId)}
        </DetailsItem>
      </DetailsCard>
      <DetailsCard title={t('employees.sections.contract')}>
        {/* Salary-type fields only when the API sent them (R7: `hr.employees.view_salary`). */}
        {salary ? (
          <DetailsItem label={t('employees.fields.basicSalary')} wide>
            <Money value={employee.basicSalary} className="text-lg font-extrabold text-primary" />
          </DetailsItem>
        ) : null}
        <DetailsItem label={t('employees.fields.contractStart')}>{date(employee.contractStart)}</DetailsItem>
        <DetailsItem label={t('employees.fields.contractEnd')}>{date(employee.contractEnd)}</DetailsItem>
        <DetailsItem label={t('employees.fields.usesBus')}>{employee.usesBus ? t('common.common.yes') : t('common.common.no')}</DetailsItem>
      </DetailsCard>
      <DetailsCard title={t('employees.sections.insurance')}>
        <DetailsItem label={t('employees.fields.insuranceStatus')} wide={!insured}>
          {t(`common.enums.insuranceStatus.${employee.insuranceStatus}`)}
        </DetailsItem>
        {insured ? (
          <>
            <DetailsItem label={t('employees.fields.insuranceNumber')}>{ltr(employee.insuranceNumber)}</DetailsItem>
            <DetailsItem label={t('employees.fields.insuranceRegistrationDate')} wide={!salary}>
              {employee.insuranceRegistrationDate ? date(employee.insuranceRegistrationDate) : notSet}
            </DetailsItem>
            {salary ? (
              <DetailsItem label={t('employees.fields.insuredSalary')}>
                {employee.insuredSalary == null ? notSet : <Money value={employee.insuredSalary} />}
              </DetailsItem>
            ) : null}
          </>
        ) : null}
      </DetailsCard>
      {salary ? (
        <DetailsCard title={t('employees.sections.bank')}>
          <DetailsItem label={t('employees.fields.bankName')}>{text(employee.bankName ?? null)}</DetailsItem>
          <DetailsItem label={t('employees.fields.bankAccountNumber')}>{ltr(employee.bankAccountNumber ?? null)}</DetailsItem>
          <DetailsItem label={t('employees.fields.iban')} wide>
            {ltr(employee.iban ?? null)}
          </DetailsItem>
        </DetailsCard>
      ) : null}
      <DetailsCard title={t('employees.sections.emergency')}>
        <DetailsItem label={t('employees.fields.emergencyContactName')}>{text(employee.emergencyContactName)}</DetailsItem>
        <DetailsItem label={t('employees.fields.emergencyContactRelationship')}>{text(employee.emergencyContactRelationship)}</DetailsItem>
        <DetailsItem label={t('employees.fields.emergencyContactPhone')} wide>
          {ltr(employee.emergencyContactPhone)}
        </DetailsItem>
      </DetailsCard>
      <DetailsCard title={t('employees.sections.qualification')}>
        <DetailsItem label={t('employees.fields.highestDegree')}>
          {employee.highestDegree ? t(`common.enums.degree.${employee.highestDegree}`) : notSet}
        </DetailsItem>
        <DetailsItem label={t('employees.fields.graduationYear')}>
          {employee.graduationYear == null ? notSet : <bdi className="tabular">{employee.graduationYear}</bdi>}
        </DetailsItem>
        <DetailsItem label={t('employees.fields.major')}>{text(employee.major)}</DetailsItem>
        <DetailsItem label={t('employees.fields.university')}>{text(employee.university)}</DetailsItem>
      </DetailsCard>
    </div>
  );
}

export function DetailsCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section data-skeleton-block="details-card" className={cn('flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-card md:p-6', className)}>
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

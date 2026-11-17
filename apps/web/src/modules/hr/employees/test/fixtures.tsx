import type { Employee, EmployeeSummary, ListItem } from '@school-erp/shared';
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from 'react';
import type { Locale } from '@/shared/lib/i18n';
import { renderWithI18n } from '@/test/render';
import { EmployeesI18n } from '../messages';

/** Test data for the employees screens. Ids are fixed UUID-shaped strings. */

export const item = (id: string, nameEn: string, nameAr: string, isActive = true, sortOrder = 1): ListItem => ({
  id,
  nameEn,
  nameAr,
  isActive,
  sortOrder,
});

export const departments: ListItem[] = [
  item('d-math', 'Mathematics', 'الرياضيات', true, 1),
  item('d-sci', 'Science', 'العلوم', true, 2),
];
export const stages: ListItem[] = [
  item('s-kg', 'Kindergarten', 'رياض الأطفال', true, 1),
  item('s-pri', 'Primary', 'الابتدائي', true, 2),
];
export const jobTitles: ListItem[] = [item('j-teacher', 'Teacher', 'معلم', true, 1)];

export const employee: Employee = {
  id: 'e-mona',
  code: 'EMP-0001',
  nameEn: 'Mona Khalil',
  nameAr: 'منى خليل',
  nationalId: '29001011234567',
  gender: 'FEMALE',
  dateOfBirth: '1990-01-01',
  phone: '01012345678',
  email: null,
  address: null,
  hireDate: '2020-09-01',
  stage: { id: 's-pri', nameEn: 'Primary', nameAr: 'الابتدائي' },
  department: { id: 'd-math', nameEn: 'Mathematics', nameAr: 'الرياضيات' },
  jobTitle: { id: 'j-teacher', nameEn: 'Teacher', nameAr: 'معلم' },
  manager: null,
  grade: null,
  workSystem: 'FULL_TIME',
  basicSalary: 1400000,
  fingerprintId: '1042',
  contractStart: '2026-06-01',
  contractEnd: '2027-05-31',
  usesBus: false,
  status: 'ACTIVE',
  userId: null,
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
};

export const summary = (overrides: Partial<EmployeeSummary> & Pick<EmployeeSummary, 'id' | 'code' | 'nameEn' | 'nameAr'>): EmployeeSummary => ({
  department: employee.department,
  stage: employee.stage,
  jobTitle: employee.jobTitle,
  workSystem: 'FULL_TIME',
  basicSalary: 1200000,
  status: 'ACTIVE',
  ...overrides,
});

/** Render an employees screen with the `employees` namespace, like its route does. */
export function renderEmployees(ui: ReactElement, locale: Locale = 'en') {
  return renderWithI18n(<EmployeesI18n locale={locale}>{ui}</EmployeesI18n>, { locale });
}

/** `next/link` stand-in: a plain anchor (navigation is the router's job, not these tests'). */
export function MockLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; scroll?: boolean }) {
  const anchor = { ...props };
  delete anchor.scroll;
  return <a {...anchor} onClick={(e) => e.preventDefault()} />;
}

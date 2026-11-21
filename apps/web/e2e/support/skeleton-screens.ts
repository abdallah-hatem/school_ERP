/*
 * The screens the skeleton spec compares, and which of them covers each route's `loading.tsx`.
 * Plain data (no Playwright import), so the unit guard `src/test/skeleton-coverage.guard.test.ts`
 * can read it: a `loading.tsx` whose route isn't listed in SKELETON_ROUTES fails that test, so a
 * new page can't skip the skeleton check (owner, 2026-11-21 — the Approved payroll pages from #171
 * had been left out and their header skeleton lost its buttons and pill unnoticed).
 */

/** Every screen with a skeleton, in menu order. */
export const SKELETON_SCREENS = [
  'dashboard',
  'employees',
  'employee-details',
  'employee-penalties',
  'employee-payroll',
  'employee-history',
  'employee-new',
  'employee-edit',
  'penalties',
  'lateness',
  'payroll',
  'payroll-run',
  'payroll-run-history',
  'payslip',
  'payroll-taxes',
  'payroll-taxes-month',
  'accounting-payroll',
  'accounting-payroll-month',
  'activity',
  'users',
  'user-new',
  'user-edit',
  'roles',
  'role-new',
  'role-edit',
  'account',
  'account-notifications',
  'settings-school',
  'settings-structure',
  'settings-lists',
  'settings-hr-rules',
  'settings-catalogue',
  'settings-notifications',
] as const;
export type SkeletonScreenName = (typeof SKELETON_SCREENS)[number];

/**
 * Each `loading.tsx` under `src/app/[locale]/(dashboard)/`, by its folder, and the screens whose
 * check shows it. A parent boundary (`employees/[id]`, `payroll/[id]`) is what a hard load of the
 * routes below it shows first, so the screens under it cover it. An entry may instead be an
 * exemption — `{ exempt: '<why>' }` — for a `loading.tsx` no screen can show; none today.
 */
export const SKELETON_ROUTES: Record<string, readonly SkeletonScreenName[] | { exempt: string }> = {
  'account/(profile)': ['account'],
  'account/notifications': ['account-notifications'],
  'accounting/payroll-taxes/(list)': ['payroll-taxes'],
  'accounting/payroll-taxes/[month]': ['payroll-taxes-month'],
  'accounting/payroll/(list)': ['accounting-payroll'],
  'accounting/payroll/[month]': ['accounting-payroll-month'],
  activity: ['activity'],
  'employees/(list)': ['employees'],
  'employees/[id]': ['employee-details', 'employee-edit'],
  'employees/[id]/(profile)': ['employee-details'],
  'employees/[id]/(profile)/history': ['employee-history'],
  'employees/[id]/(profile)/payroll': ['employee-payroll'],
  'employees/[id]/(profile)/penalties': ['employee-penalties'],
  'employees/[id]/edit': ['employee-edit'],
  'employees/new': ['employee-new'],
  lateness: ['lateness'],
  'payroll/(list)': ['payroll'],
  'payroll/[id]': ['payroll-run', 'payslip'],
  'payroll/[id]/(run)': ['payroll-run'],
  'payroll/[id]/(run)/history': ['payroll-run-history'],
  'payroll/[id]/payslip/[lineId]': ['payslip'],
  penalties: ['penalties'],
  'roles/(list)': ['roles'],
  'roles/[id]': ['role-edit'],
  'roles/new': ['role-new'],
  'users/(list)': ['users'],
  'users/[id]': ['user-edit'],
  'users/new': ['user-new'],
};

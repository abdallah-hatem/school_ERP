import type { PermissionKey } from './permissions';

/*
 * Which permissions open each screen of the web app (spec roles-permissions R6) — the one list the
 * page guards (`requireScreen`), the sidebar, the dashboard's quick links, the Settings sections and
 * the role-access smoke spec (apps/web/e2e/24-role-access.spec.ts) all read, so they can't drift
 * apart. View only: the API's guard is the protection.
 *
 * A requirement is one key, or several that are all required. A screen opens for a user holding at
 * least one of its `anyOf`; `anyOf: null` opens for every signed-in user.
 */

export type ScreenRequirement = PermissionKey | readonly PermissionKey[];

/**
 * The Settings screen's sections, in menu order (`?section=` in the URL), and the key that shows
 * each. Settings itself opens for anyone who may see one of them.
 */
export const SETTINGS_SECTION_ACCESS = {
  school: 'core.settings.view',
  structure: 'core.stages.view',
  lists: 'hr.lists.view',
  hrRules: 'hr.settings.view',
  catalogue: 'hr.penalty_catalogue.view',
  // The payroll tax rule (§10): the Accountant's section.
  accounting: 'accounting.settings.view',
  // The school's notification defaults, reminder timing and retention (§11): the System admin
  // changes it, the HR manager sees it read-only (owner, 2026-11-18).
  notifications: 'core.notifications.view',
} as const satisfies Record<string, PermissionKey>;
export type SettingsSectionId = keyof typeof SETTINGS_SECTION_ACCESS;
export const SETTINGS_SECTIONS = Object.keys(SETTINGS_SECTION_ACCESS) as SettingsSectionId[];

export interface ScreenAccess {
  /**
   * Path after the locale segment; `''` is the dashboard, `:id` / `:lineId` a record's id, `:month`
   * a `YYYY-MM` month.
   */
  path: string;
  anyOf: readonly ScreenRequirement[] | null;
}

const screen = (path: string, ...anyOf: ScreenRequirement[]): ScreenAccess => ({
  path,
  anyOf: anyOf.length > 0 ? anyOf : null,
});

/** A profile tab needs the profile itself (its layout's guard) and what the tab shows. */
const profileTab = (path: string, key: PermissionKey) => screen(path, ['hr.employees.view', key]);

export const SCREENS = {
  dashboard: screen(''),
  account: screen('/account'),
  accountNotifications: screen('/account/notifications'),
  employees: screen('/employees', 'hr.employees.view'),
  employeeNew: screen('/employees/new', 'hr.employees.create'),
  employee: screen('/employees/:id', 'hr.employees.view'),
  employeeEdit: screen('/employees/:id/edit', 'hr.employees.edit'),
  employeePenalties: profileTab('/employees/:id/penalties', 'hr.penalties.view'),
  employeePayroll: profileTab('/employees/:id/payroll', 'hr.payroll.view'),
  employeeHistory: profileTab('/employees/:id/history', 'core.audit.view'),
  // Contracts (spec 2026-11-24): the employee's contract history, and the renewal season.
  employeeContracts: profileTab('/employees/:id/contracts', 'hr.contracts.view'),
  contracts: screen('/contracts', 'hr.contracts.view'),
  penalties: screen('/penalties', 'hr.penalties.view'),
  lateness: screen('/lateness', 'hr.lateness.view'),
  payroll: screen('/payroll', 'hr.payroll.view'),
  payrollRun: screen('/payroll/:id', 'hr.payroll.view'),
  // The run's History tab: the run (its layout's guard) and the activity log.
  payrollRunHistory: screen('/payroll/:id/history', ['hr.payroll.view', 'core.audit.view']),
  payslip: screen('/payroll/:id/payslip/:lineId', 'hr.payroll.view'),
  // Accounting (§10): the year board of payroll taxes and one month's statement (`:month` YYYY-MM).
  // Accounting → Payroll: HR's approved months as HR shows them, plus insurance and taxes.
  accountingPayroll: screen('/accounting/payroll', 'accounting.payroll.view'),
  accountingPayrollMonth: screen('/accounting/payroll/:month', 'accounting.payroll.view'),
  payrollTaxes: screen('/accounting/payroll-taxes', 'accounting.payroll.view'),
  payrollTaxesMonth: screen('/accounting/payroll-taxes/:month', 'accounting.payroll.view'),
  settings: screen('/settings', ...Object.values(SETTINGS_SECTION_ACCESS)),
  activity: screen('/activity', 'core.audit.view'),
  users: screen('/users', 'core.users.view'),
  userNew: screen('/users/new', 'core.users.manage'),
  user: screen('/users/:id', 'core.users.view'),
  roles: screen('/roles', 'core.roles.view'),
  roleNew: screen('/roles/new', 'core.roles.manage'),
  role: screen('/roles/:id', 'core.roles.view'),
} as const satisfies Record<string, ScreenAccess>;
export type ScreenId = keyof typeof SCREENS;
export const SCREEN_IDS = Object.keys(SCREENS) as ScreenId[];

/**
 * The screens the sidebar links to, in menu order (apps/web `NAV_MODULES` draws them with their
 * icons and groups; a unit test keeps the two the same).
 */
export const SIDEBAR_SCREENS = [
  'dashboard',
  'employees',
  'contracts',
  'penalties',
  'lateness',
  'payroll',
  'accountingPayroll',
  'payrollTaxes',
  'settings',
  'activity',
  'users',
  'roles',
] as const satisfies readonly ScreenId[];

/** Whether a set of granted keys meets one requirement (all of its keys). */
function meets(granted: ReadonlySet<string>, required: ScreenRequirement): boolean {
  return (typeof required === 'string' ? [required] : required).every((k) => granted.has(k));
}

/** Whether someone holding `granted` may open `id`. */
export function canOpenScreen(granted: readonly string[] | ReadonlySet<string>, id: ScreenId): boolean {
  const set = granted instanceof Set ? granted : new Set(granted as readonly string[]);
  const { anyOf } = SCREENS[id] as ScreenAccess;
  return anyOf === null || anyOf.some((r) => meets(set, r));
}

/** The Settings sections someone holding `granted` may view, in menu order. */
export function visibleSettingsSections(granted: readonly string[] | ReadonlySet<string>): SettingsSectionId[] {
  const set = granted instanceof Set ? granted : new Set(granted as readonly string[]);
  return SETTINGS_SECTIONS.filter((id) => set.has(SETTINGS_SECTION_ACCESS[id]));
}

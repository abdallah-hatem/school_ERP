import { SCREENS, type ScreenAccess } from '@school-erp/shared';
import type { PermissionRequirement } from '@/core/auth/permissions';
import {
  AcademicsIcon,
  AccountingModuleIcon,
  ActivityIcon,
  AdministrationModuleIcon,
  AttendanceIcon,
  ContractsIcon,
  DashboardIcon,
  ExamsIcon,
  FeesIcon,
  HrModuleIcon,
  LatenessIcon,
  LeaveIcon,
  ParentPortalModuleIcon,
  PayrollIcon,
  PayrollTaxesIcon,
  PenaltiesIcon,
  RolesIcon,
  SchoolModuleIcon,
  SettingsIcon,
  StaffIcon,
  StudentsIcon,
  TransportModuleIcon,
  UsersIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';

export interface NavItem {
  /** Key under `common.nav` for the label. */
  key:
    | 'dashboard'
    | 'employees'
    | 'contracts'
    | 'penalties'
    | 'lateness'
    | 'payroll'
    | 'accountingPayroll'
    | 'payrollTaxes'
    | 'settings'
    | 'activity'
    | 'users'
    | 'roles';
  /** Path after the locale segment; `''` is the dashboard. */
  path: string;
  icon: AppIcon;
  /**
   * Shown only to a user holding at least one of these (view only — the API still refuses).
   * Absent: shown to every signed-in user.
   */
  anyOf?: readonly PermissionRequirement[];
}

/**
 * A page that hasn't landed yet: drawn locked with a "Soon" tag where it will live, never a link.
 * Not a screen — it has no path and is not in `NAV_ITEMS`, so nothing can open it.
 */
export interface ComingItem {
  /** Key under `common.nav.coming` for the label. */
  key: 'students' | 'academics' | 'attendance' | 'exams' | 'leave' | 'fees';
  icon: AppIcon;
}

/** How a module's icon tile is coloured (token pairs, so the palette stays in globals.css). */
export type ModuleTone = 'neutral' | 'primary' | 'accent';

export interface NavModule {
  key: 'home' | 'school' | 'hr' | 'accounting' | 'transport' | 'parentPortal' | 'administration';
  /** Translation key of the module's name. */
  nameKey: `common.nav.modules.${string}`;
  icon: AppIcon;
  tone: ModuleTone;
  /** Its pages. A live module with one page is drawn as that page's link, not as a group. */
  items: readonly NavItem[];
  /** Its pages still to come, drawn locked after its live pages (shown to whoever sees the module). */
  coming?: readonly ComingItem[];
  /**
   * `soon`: not built yet, shown to everyone. Without `coming` pages it is one locked row with a
   * "Soon" tag; with them, a group that opens to show them, all locked.
   */
  status: 'live' | 'soon';
}

/**
 * A sidebar page: its path and who sees it come from `SCREENS` (`@school-erp/shared`), the same
 * entry its page guard (`requireScreen`) reads — so the link and the page can't disagree.
 */
const page = (key: NavItem['key'], icon: AppIcon): NavItem => {
  const { path, anyOf } = SCREENS[key] as ScreenAccess;
  return anyOf ? { key, path, icon, anyOf } : { key, path, icon };
};

/**
 * The menu, one entry per module (docs/ARCHITECTURE.md → core/navigation). Adding a module is one
 * entry here plus its name in `common.nav.modules`. Pages are filtered by permission
 * (`visibleItems`); later also by feature flags.
 */
export const NAV_MODULES: readonly NavModule[] = [
  {
    key: 'home',
    nameKey: 'common.nav.modules.home',
    icon: DashboardIcon,
    tone: 'neutral',
    items: [page('dashboard', DashboardIcon)],
    status: 'live',
  },
  {
    // The school's own side, still to come (docs/business/08-scope.md).
    key: 'school',
    nameKey: 'common.nav.modules.school',
    icon: SchoolModuleIcon,
    tone: 'neutral',
    items: [],
    coming: [
      { key: 'students', icon: StudentsIcon },
      { key: 'academics', icon: AcademicsIcon },
      { key: 'attendance', icon: AttendanceIcon },
      { key: 'exams', icon: ExamsIcon },
    ],
    status: 'soon',
  },
  {
    key: 'hr',
    nameKey: 'common.nav.modules.hr',
    icon: HrModuleIcon,
    tone: 'primary',
    items: [
      page('employees', StaffIcon),
      page('contracts', ContractsIcon),
      page('penalties', PenaltiesIcon),
      page('lateness', LatenessIcon),
      page('payroll', PayrollIcon),
    ],
    coming: [{ key: 'leave', icon: LeaveIcon }],
    status: 'live',
  },
  {
    // §10 (the Accountant's screens): HR's approved months with their taxes, and the payroll-taxes year board.
    key: 'accounting',
    nameKey: 'common.nav.modules.accounting',
    icon: AccountingModuleIcon,
    tone: 'primary',
    items: [page('accountingPayroll', PayrollIcon), page('payrollTaxes', PayrollTaxesIcon)],
    coming: [{ key: 'fees', icon: FeesIcon }],
    status: 'live',
  },
  { key: 'transport', nameKey: 'common.nav.modules.transport', icon: TransportModuleIcon, tone: 'neutral', items: [], status: 'soon' },
  {
    key: 'parentPortal',
    nameKey: 'common.nav.modules.parentPortal',
    icon: ParentPortalModuleIcon,
    tone: 'neutral',
    items: [],
    status: 'soon',
  },
  {
    // Settings, the activity log, users and roles: the school's own administration.
    key: 'administration',
    nameKey: 'common.nav.modules.administration',
    icon: AdministrationModuleIcon,
    tone: 'accent',
    items: [
      // Settings: anyone who may view one of its sections (SETTINGS_SECTION_ACCESS).
      page('settings', SettingsIcon),
      page('activity', ActivityIcon),
      // Who can sign in and what each role may do (spec roles-permissions, P3).
      page('users', UsersIcon),
      page('roles', RolesIcon),
    ],
    status: 'live',
  },
];

/** Whether the user may see `item` (`can` for the signed-in user). */
export function itemIsVisible(item: NavItem, can: (required: PermissionRequirement) => boolean): boolean {
  return !item.anyOf || item.anyOf.some(can);
}

/**
 * The menu as the user may see it: each live module keeps only its visible pages (and its coming
 * ones) and disappears when no page is left; coming modules (`soon`) always show.
 */
export function visibleModules(
  modules: readonly NavModule[],
  can: (required: PermissionRequirement) => boolean,
): NavModule[] {
  return modules.flatMap((module) => {
    if (module.status === 'soon') return [module];
    const items = module.items.filter((item) => itemIsVisible(item, can));
    return items.length > 0 ? [{ ...module, items }] : [];
  });
}

/** Every page in the menu, in order — live pages only: coming ones are never a screen. */
export const NAV_ITEMS: readonly NavItem[] = NAV_MODULES.flatMap((m) => m.items);

/** Whether `item` is the current section for `pathname` (`/ar/payroll/2026-11` → payroll). */
export function isActive(item: NavItem, pathname: string, locale: string): boolean {
  const base = `/${locale}${item.path}`;
  if (item.path === '') return pathname === base || pathname === `${base}/`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Whether one of `module`'s pages is the current one. */
export function moduleIsActive(module: NavModule, pathname: string, locale: string): boolean {
  return module.items.some((item) => isActive(item, pathname, locale));
}

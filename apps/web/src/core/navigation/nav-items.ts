import type { PermissionRequirement } from '@/core/auth/permissions';
import {
  AccountingModuleIcon,
  ActivityIcon,
  AdministrationModuleIcon,
  DashboardIcon,
  HrModuleIcon,
  InventoryModuleIcon,
  LatenessIcon,
  PayrollIcon,
  PenaltiesIcon,
  SettingsIcon,
  StaffIcon,
  StudentsModuleIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';

export interface NavItem {
  /** Key under `common.nav` for the label. */
  key: 'dashboard' | 'employees' | 'penalties' | 'lateness' | 'payroll' | 'settings' | 'activity';
  /** Path after the locale segment; `''` is the dashboard. */
  path: string;
  icon: AppIcon;
  /**
   * Shown only to a user holding at least one of these (view only — the API still refuses).
   * Absent: shown to every signed-in user.
   */
  anyOf?: readonly PermissionRequirement[];
}

/** How a module's icon tile is coloured (token pairs, so the palette stays in globals.css). */
export type ModuleTone = 'neutral' | 'primary' | 'accent';

export interface NavModule {
  key: 'home' | 'hr' | 'accounting' | 'inventory' | 'students' | 'administration';
  /** Translation key of the module's name. */
  nameKey: `common.nav.modules.${string}`;
  icon: AppIcon;
  tone: ModuleTone;
  /** Its pages. A live module with one page is drawn as that page's link, not as a group. */
  items: readonly NavItem[];
  /** `soon`: shown locked with a "Soon" tag, never a link. */
  status: 'live' | 'soon';
}

const page = (
  key: NavItem['key'],
  path: string,
  icon: AppIcon,
  anyOf?: readonly PermissionRequirement[],
): NavItem => (anyOf ? { key, path, icon, anyOf } : { key, path, icon });

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
    items: [page('dashboard', '', DashboardIcon)],
    status: 'live',
  },
  {
    key: 'hr',
    nameKey: 'common.nav.modules.hr',
    icon: HrModuleIcon,
    tone: 'primary',
    items: [
      page('employees', '/employees', StaffIcon, ['hr.employees.view']),
      page('penalties', '/penalties', PenaltiesIcon, ['hr.penalties.view']),
      page('lateness', '/lateness', LatenessIcon, ['hr.lateness.view']),
      page('payroll', '/payroll', PayrollIcon, ['hr.payroll.view']),
    ],
    status: 'live',
  },
  { key: 'accounting', nameKey: 'common.nav.modules.accounting', icon: AccountingModuleIcon, tone: 'neutral', items: [], status: 'soon' },
  { key: 'inventory', nameKey: 'common.nav.modules.inventory', icon: InventoryModuleIcon, tone: 'neutral', items: [], status: 'soon' },
  { key: 'students', nameKey: 'common.nav.modules.students', icon: StudentsModuleIcon, tone: 'neutral', items: [], status: 'soon' },
  {
    // Settings and the activity log (audit spec → Screens): the school's own administration.
    key: 'administration',
    nameKey: 'common.nav.modules.administration',
    icon: AdministrationModuleIcon,
    tone: 'accent',
    items: [
      page('settings', '/settings', SettingsIcon, [
        'core.settings.view',
        'hr.settings.view',
        'hr.lists.view',
        'core.stages.view',
        'hr.penalty_catalogue.view',
      ]),
      page('activity', '/activity', ActivityIcon, ['core.audit.view']),
    ],
    status: 'live',
  },
];

/** Whether the user may see `item` (`can` for the signed-in user). */
export function itemIsVisible(item: NavItem, can: (required: PermissionRequirement) => boolean): boolean {
  return !item.anyOf || item.anyOf.some(can);
}

/**
 * The menu as the user may see it: each live module keeps only its visible pages and disappears
 * when none is left; coming modules (`soon`) always show.
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

/** Every page in the menu, in order. */
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

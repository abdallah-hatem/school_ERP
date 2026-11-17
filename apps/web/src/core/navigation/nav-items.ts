import {
  AccountingModuleIcon,
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
  key: 'dashboard' | 'employees' | 'penalties' | 'lateness' | 'payroll' | 'settings';
  /** Path after the locale segment; `''` is the dashboard. */
  path: string;
  icon: AppIcon;
}

/** How a module's icon tile is coloured (token pairs, so the palette stays in globals.css). */
export type ModuleTone = 'neutral' | 'primary';

export interface NavModule {
  key: 'home' | 'hr' | 'accounting' | 'inventory' | 'students';
  /** Translation key of the module's name. */
  nameKey: `common.nav.modules.${string}`;
  icon: AppIcon;
  tone: ModuleTone;
  /** Its pages. A live module with one page is drawn as that page's link, not as a group. */
  items: readonly NavItem[];
  /** `soon`: shown locked with a "Soon" tag, never a link. */
  status: 'live' | 'soon';
}

const page = (key: NavItem['key'], path: string, icon: AppIcon): NavItem => ({ key, path, icon });

/**
 * The menu, one entry per module (docs/ARCHITECTURE.md → core/navigation). Adding a module is one
 * entry here plus its name in `common.nav.modules`. Later: filtered by feature flags and permissions.
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
      page('employees', '/employees', StaffIcon),
      page('penalties', '/penalties', PenaltiesIcon),
      page('lateness', '/lateness', LatenessIcon),
      page('payroll', '/payroll', PayrollIcon),
    ],
    status: 'live',
  },
  { key: 'accounting', nameKey: 'common.nav.modules.accounting', icon: AccountingModuleIcon, tone: 'neutral', items: [], status: 'soon' },
  { key: 'inventory', nameKey: 'common.nav.modules.inventory', icon: InventoryModuleIcon, tone: 'neutral', items: [], status: 'soon' },
  { key: 'students', nameKey: 'common.nav.modules.students', icon: StudentsModuleIcon, tone: 'neutral', items: [], status: 'soon' },
];

/** Settings sits apart, at the bottom of the menu above the user. */
export const SETTINGS_ITEM: NavItem = page('settings', '/settings', SettingsIcon);

/** Every page in the menu, in order. */
export const NAV_ITEMS: readonly NavItem[] = [...NAV_MODULES.flatMap((m) => m.items), SETTINGS_ITEM];

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

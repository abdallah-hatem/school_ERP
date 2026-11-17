import {
  DashboardIcon,
  EmployeesIcon,
  LatenessIcon,
  PayrollIcon,
  PenaltiesIcon,
  SettingsIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';

export interface NavItem {
  /** Key under `common.nav` for the label. */
  key: 'dashboard' | 'employees' | 'penalties' | 'lateness' | 'payroll' | 'settings';
  /** Path after the locale segment; `''` is the dashboard. */
  path: string;
  icon: AppIcon;
  /** Drawn after a separator at the end of the list. */
  group: 'main' | 'admin';
}

/**
 * Every screen of the HR demo, created up front so feature tasks only fill in their pages.
 * Later: filtered by feature flags and permissions (docs/ARCHITECTURE.md → core/navigation).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', path: '', icon: DashboardIcon, group: 'main' },
  { key: 'employees', path: '/employees', icon: EmployeesIcon, group: 'main' },
  { key: 'penalties', path: '/penalties', icon: PenaltiesIcon, group: 'main' },
  { key: 'lateness', path: '/lateness', icon: LatenessIcon, group: 'main' },
  { key: 'payroll', path: '/payroll', icon: PayrollIcon, group: 'main' },
  { key: 'settings', path: '/settings', icon: SettingsIcon, group: 'admin' },
];

/** Whether `item` is the current section for `pathname` (`/ar/payroll/2026-11` → payroll). */
export function isActive(item: NavItem, pathname: string, locale: string): boolean {
  const base = `/${locale}${item.path}`;
  if (item.path === '') return pathname === base || pathname === `${base}/`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

import {
  PERMISSION_KEYS,
  PermissionScope,
  type PermissionKey,
  type PermissionScope as Scope,
} from './permissions';

/*
 * The starting roles (spec docs/specs/2026-11-17-roles-permissions.md → Starting roles, GUESS).
 * Roles are data (R2): the P2 migration copies this table into `roles` / `role_permissions` once,
 * and from then on a school changes its roles through the Roles API, never in code. A test checks
 * the migrated rows against this table, and this table against the spec.
 *
 * Employee self-service (scope `self`) is Planned and not seeded yet.
 */

/** Holds every permission, always — new keys reach it without a migration (R8: no lock-out). */
export const SYSTEM_ADMIN_ROLE = 'system_admin';

export const BuiltInRole = {
  SYSTEM_ADMIN: SYSTEM_ADMIN_ROLE,
  HR_MANAGER: 'hr_manager',
  HR_OFFICER: 'hr_officer',
  ACCOUNTANT: 'accountant',
  PRINCIPAL: 'principal',
  STAGE_HEAD: 'stage_head',
  DIRECT_MANAGER: 'direct_manager',
} as const;
export type BuiltInRole = (typeof BuiltInRole)[keyof typeof BuiltInRole];

export interface BuiltInRoleDefinition {
  key: BuiltInRole;
  nameEn: string;
  nameAr: string;
  /** Each permission the role grants, with its scope. */
  permissions: Partial<Record<PermissionKey, Scope>>;
}

const all = (...keys: PermissionKey[]) =>
  Object.fromEntries(keys.map((k) => [k, PermissionScope.ALL])) as Partial<
    Record<PermissionKey, Scope>
  >;

const scoped = (scope: Scope, ...keys: PermissionKey[]) =>
  Object.fromEntries(keys.map((k) => [k, scope])) as Partial<Record<PermissionKey, Scope>>;

/**
 * Keys no starting role holds but the System admin (who holds every key): an admin grants them to
 * other roles. The dashboard's analytics charts — "for now make it only visible to the system
 * admin" (owner, 2026-11-21, §2).
 */
export const ADMIN_ONLY_AT_START: readonly PermissionKey[] = ['hr.dashboard.view_analytics'];

/**
 * Every HR key but the admin-only ones and the stage review: that step belongs to the stage head of
 * the penalty's stage (§4, owner 2026-11-21); the HR manager acts at the HR step.
 */
const HR_KEYS = PERMISSION_KEYS.filter(
  (k) => k.startsWith('hr.') && !ADMIN_ONLY_AT_START.includes(k) && k !== 'hr.penalties.review',
);

/** A team or stage role sees and records penalties for its people; the lists it picks from are school-wide. */
const lineManager = (scope: Scope, ...extra: PermissionKey[]) => ({
  ...scoped(scope, 'hr.employees.view', 'hr.penalties.view', 'hr.penalties.record', ...extra),
  ...all('core.stages.view', 'hr.penalty_catalogue.view'),
});

export const BUILT_IN_ROLES: readonly BuiltInRoleDefinition[] = [
  {
    key: BuiltInRole.SYSTEM_ADMIN,
    nameEn: 'System admin',
    nameAr: 'مدير النظام',
    permissions: all(...PERMISSION_KEYS),
  },
  {
    key: BuiltInRole.HR_MANAGER,
    nameEn: 'HR manager',
    nameAr: 'مدير شؤون الموظفين',
    // Settings → Notifications read-only (owner, 2026-11-18): the System admin changes it.
    permissions: all(...HR_KEYS, 'core.stages.view', 'core.audit.view', 'core.notifications.view'),
  },
  {
    key: BuiltInRole.HR_OFFICER,
    nameEn: 'HR officer',
    nameAr: 'موظف شؤون الموظفين',
    permissions: all(
      'core.stages.view',
      'hr.dashboard.view',
      'hr.employees.view',
      'hr.employees.view_salary',
      'hr.employees.create',
      'hr.employees.edit',
      'hr.employees.change_status',
      'hr.lists.view',
      'hr.settings.view',
      'hr.penalty_catalogue.view',
      'hr.penalties.view',
      'hr.penalties.record',
      'hr.lateness.view',
      'hr.lateness.edit',
      'hr.payroll.view',
      'hr.payroll.create',
      'hr.payroll.recalculate',
      'hr.payroll.adjust',
    ),
  },
  {
    key: BuiltInRole.ACCOUNTANT,
    nameEn: 'Accountant',
    nameAr: 'المحاسب',
    permissions: all(
      'hr.employees.view',
      'hr.employees.view_salary',
      'hr.payroll.view',
      'hr.payroll.export_bank_sheet',
      'accounting.settings.view',
      'accounting.settings.edit',
      'accounting.payroll.view',
      'accounting.payroll.return',
      'accounting.payroll.finalize',
    ),
  },
  {
    key: BuiltInRole.PRINCIPAL,
    nameEn: 'Principal / administrative director',
    nameAr: 'المدير / المدير الإداري',
    permissions: all(
      'core.stages.view',
      'core.audit.view',
      'hr.dashboard.view',
      'hr.employees.view',
      'hr.lists.view',
      'hr.penalty_catalogue.view',
      'hr.penalties.view',
      'hr.penalties.approve',
      'hr.penalties.cancel',
      'hr.lateness.view',
      'hr.payroll.view',
    ),
  },
  {
    key: BuiltInRole.STAGE_HEAD,
    nameEn: 'Stage head',
    nameAr: 'رئيس المرحلة',
    permissions: lineManager(PermissionScope.OWN_STAGE, 'hr.penalties.review'),
  },
  {
    key: BuiltInRole.DIRECT_MANAGER,
    nameEn: 'Direct manager',
    nameAr: 'المدير المباشر',
    permissions: lineManager(PermissionScope.OWN_TEAM),
  },
];

/** The seeded admin (and, at the P2 migration, every HR admin) gets these two roles. */
export const SEED_ADMIN_ROLES: readonly BuiltInRole[] = [
  BuiltInRole.SYSTEM_ADMIN,
  BuiltInRole.HR_MANAGER,
];

export function isBuiltInRole(key: string): key is BuiltInRole {
  return BUILT_IN_ROLES.some((r) => r.key === key);
}

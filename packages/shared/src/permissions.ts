/*
 * Permissions (spec docs/specs/2026-11-17-roles-permissions.md, R1). Every endpoint declares the
 * keys it needs (`@Permission('hr.payroll.approve')`), the API's global guard checks them, and the
 * web app hides what the user can't do with `can(key)`.
 *
 * A key is `<module>.<area>.<action>`. Its EN / AR label and description are
 * `keys.<key path>.label` / `.description` in `locales/<lang>/permissions.json`; the module's
 * name is `modules.<module>`.
 *
 * Adding a permission: add the key below with its module, then its label and description in both
 * `locales/en/permissions.json` and `locales/ar/permissions.json`. The shared tests fail on a key
 * without a label in either language, or a label without a key.
 */

/** Which module a permission belongs to (the roles screen groups them by module). */
export const PERMISSION_MODULES = ['core', 'hr', 'accounting'] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export interface PermissionDefinition {
  module: PermissionModule;
}

const core = { module: 'core' } as const;
const hr = { module: 'hr' } as const;
const accounting = { module: 'accounting' } as const;

/** Every permission, grouped by module and area, in the order the roles screen lists them. */
export const PERMISSIONS = {
  // core — school settings (Settings → School, its change history)
  'core.settings.view': core,
  'core.settings.edit': core,
  // core — school structure
  'core.stages.view': core,
  'core.stages.manage': core,
  // core — the Activity log (§9)
  'core.audit.view': core,
  // core — user accounts (Administration → Users)
  'core.users.view': core,
  'core.users.manage': core,
  // core — roles (Administration → Roles)
  'core.roles.view': core,
  'core.roles.manage': core,
  // core — event deliveries (the outbox): see the dead ones and retry them
  'core.outbox.manage': core,
  // core — notifications (§11): the school's defaults per type and how long notifications are kept
  'core.notifications.view': core,
  'core.notifications.manage': core,

  // hr — dashboard
  'hr.dashboard.view': hr,
  // hr — employees
  'hr.employees.view': hr,
  'hr.employees.view_salary': hr,
  'hr.employees.create': hr,
  'hr.employees.edit': hr,
  'hr.employees.change_status': hr,
  // hr — lists (departments, job titles)
  'hr.lists.view': hr,
  'hr.lists.manage': hr,
  // hr — rules (work days, hours, lateness and penalty rules)
  'hr.settings.view': hr,
  'hr.settings.edit': hr,
  // hr — penalty catalogue (groups and violations)
  'hr.penalty_catalogue.view': hr,
  'hr.penalty_catalogue.manage': hr,
  // hr — penalties
  'hr.penalties.view': hr,
  'hr.penalties.record': hr,
  // the stage review (§4, owner 2026-11-21): the stage head of the penalty's stage, before HR
  'hr.penalties.review': hr,
  // the HR step: fixes the level and the deduction
  'hr.penalties.approve': hr,
  'hr.penalties.cancel': hr,
  // hr — lateness
  'hr.lateness.view': hr,
  'hr.lateness.edit': hr,
  // hr — payroll
  'hr.payroll.view': hr,
  'hr.payroll.create': hr,
  'hr.payroll.recalculate': hr,
  'hr.payroll.adjust': hr,
  'hr.payroll.approve': hr,
  'hr.payroll.export_bank_sheet': hr,

  // accounting — rules (the payroll tax rule: slices, martyrs' fund, insurance share)
  'accounting.settings.view': accounting,
  'accounting.settings.edit': accounting,
  // accounting — payroll taxes of approved months
  'accounting.payroll.view': accounting,
  // accounting — send an approved month back to HR (a draft again), or finalize it (transfer made)
  'accounting.payroll.return': accounting,
  'accounting.payroll.finalize': accounting,
} as const satisfies Record<string, PermissionDefinition>;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/** The keys of each module, in registry order (the roles screen's groups). */
export function permissionsByModule(): Record<PermissionModule, PermissionKey[]> {
  const out = Object.fromEntries(PERMISSION_MODULES.map((m) => [m, []])) as unknown as Record<
    PermissionModule,
    PermissionKey[]
  >;
  for (const key of PERMISSION_KEYS) out[PERMISSIONS[key].module].push(key);
  return out;
}

/**
 * Whether a set of granted keys holds every one of `required` (all required, like
 * `@Permission(a, b)`). The web app's `can()` is this; the API guard decides with the same rule.
 */
export function hasPermissions(
  granted: readonly string[] | ReadonlySet<string>,
  required: PermissionKey | readonly PermissionKey[],
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted as readonly string[]);
  const keys: readonly PermissionKey[] = typeof required === 'string' ? [required] : required;
  return keys.every((key) => set.has(key));
}

/*
 * Scopes (R5) limit which rows a permission covers. A role grants each permission with one scope;
 * a user holding the same key through several roles gets the widest (edge case 2). The module
 * that owns the data applies the scope in its repository query, with `scopeFor(user, key)` from
 * core/permissions.
 */
export const PermissionScope = {
  /** Every row. */
  ALL: 'all',
  /** The rows of the user's own stage (their linked employee's stage). */
  OWN_STAGE: 'own_stage',
  /** The employees whose direct manager is the user's linked employee. */
  OWN_TEAM: 'own_team',
  /** Only the user's own linked employee. */
  SELF: 'self',
} as const;
export type PermissionScope = (typeof PermissionScope)[keyof typeof PermissionScope];

/** Widest first. `own_stage` counts as wider than `own_team`: a stage holds many teams. */
export const PERMISSION_SCOPES: readonly PermissionScope[] = [
  PermissionScope.ALL,
  PermissionScope.OWN_STAGE,
  PermissionScope.OWN_TEAM,
  PermissionScope.SELF,
];

export function isPermissionScope(value: unknown): value is PermissionScope {
  return typeof value === 'string' && (PERMISSION_SCOPES as readonly string[]).includes(value);
}

/**
 * The permissions whose rows a scope can narrow: the ones about particular employees (their
 * record, salary, penalties, lateness and pay). Every other permission is about the school as a
 * whole (settings, lists, rules, the catalogue, running payroll) and is only ever granted with
 * scope `all` — the roles screen shows "Whole school" for them and the API refuses another scope
 * (`INVALID_SCOPE`).
 */
export const ROW_SCOPED_PERMISSIONS: ReadonlySet<PermissionKey> = new Set<PermissionKey>([
  'hr.employees.view',
  'hr.employees.view_salary',
  'hr.employees.edit',
  'hr.employees.change_status',
  'hr.penalties.view',
  'hr.penalties.record',
  'hr.penalties.review',
  'hr.penalties.approve',
  'hr.penalties.cancel',
  'hr.lateness.view',
  'hr.lateness.edit',
  'hr.payroll.view',
]);

/** Whether a scope other than `all` may be granted for `key`. */
export function isRowScoped(key: PermissionKey): boolean {
  return ROW_SCOPED_PERMISSIONS.has(key);
}

/** The wider of two scopes (edge case 2: with two roles, the widest scope wins per key). */
export function widerScope(a: PermissionScope, b: PermissionScope): PermissionScope {
  return PERMISSION_SCOPES.indexOf(a) <= PERMISSION_SCOPES.indexOf(b) ? a : b;
}

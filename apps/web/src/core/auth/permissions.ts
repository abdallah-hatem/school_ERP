import { hasPermissions, type PermissionKey, type SessionUser } from '@school-erp/shared';

/** One key, or several that are all required (like the API's `@Permission(a, b)`). */
export type PermissionRequirement = PermissionKey | readonly PermissionKey[];

/**
 * Whether the signed-in user holds `required` (R6). **View only**: it hides buttons, tabs and menu
 * items the user can't use; the API's guard is the protection. Signed out → false.
 */
export function can(
  user: Pick<SessionUser, 'permissions'> | null | undefined,
  required: PermissionRequirement,
): boolean {
  return !!user && hasPermissions(user.permissions, required);
}

/** Whether the user holds at least one of `options` (a menu entry leading to several sections). */
export function canAny(
  user: Pick<SessionUser, 'permissions'> | null | undefined,
  options: readonly PermissionRequirement[],
): boolean {
  return options.some((required) => can(user, required));
}

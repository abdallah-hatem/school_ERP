import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@school-erp/shared';
import { IS_PUBLIC_KEY, Public } from '../../../common/decorators/public.decorator';

export const PERMISSIONS_KEY = 'permissions:required';
export const SIGNED_IN_KEY = 'permissions:signedIn';

export { Public };

/**
 * The permission keys a route needs — **all** of them (R3). Checked by the global
 * `PermissionGuard` after the JWT guard; a user missing one gets 403.
 *
 * @example @Post(':id/approve') @Permission('hr.penalties.approve') approve(...) {}
 */
export const Permission = (...keys: [PermissionKey, ...PermissionKey[]]) =>
  SetMetadata(PERMISSIONS_KEY, keys);

/**
 * Any signed-in user, whatever they hold: only for what every account needs to use the app at all
 * (`/auth/me`, sign-out, opening an uploaded file). Everything else declares a permission.
 */
export const SignedIn = () => SetMetadata(SIGNED_IN_KEY, true);

/** What a route declared. `none` and `conflict` are refused (closed by default). */
export type PermissionDeclaration =
  | { kind: 'public' }
  | { kind: 'signed-in' }
  | { kind: 'permission'; keys: readonly PermissionKey[] }
  | { kind: 'none' }
  /** More than one of `@Public`, `@SignedIn`, `@Permission` on the same handler or class. */
  | { kind: 'conflict' };

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- a route handler or class
function declarationAt(target: Function): PermissionDeclaration {
  const found: PermissionDeclaration[] = [];
  if (Reflect.getMetadata(IS_PUBLIC_KEY, target) === true) found.push({ kind: 'public' });
  if (Reflect.getMetadata(SIGNED_IN_KEY, target) === true) found.push({ kind: 'signed-in' });
  const keys = Reflect.getMetadata(PERMISSIONS_KEY, target) as PermissionKey[] | undefined;
  if (Array.isArray(keys) && keys.length > 0) found.push({ kind: 'permission', keys });
  if (found.length > 1) return { kind: 'conflict' };
  return found[0] ?? { kind: 'none' };
}

/**
 * A route's declaration: the handler's own, else its controller's (a class-level `@Permission`
 * covers every handler that declares nothing itself).
 */
export function permissionDeclarationOf(
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- any route handler
  handler: Function,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- its controller class
  controller?: Function,
): PermissionDeclaration {
  const own = declarationAt(handler);
  if (own.kind !== 'none' || !controller) return own;
  return declarationAt(controller);
}

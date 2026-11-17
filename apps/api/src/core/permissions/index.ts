/*
 * core/permissions (spec docs/specs/2026-11-17-roles-permissions.md, P1). Every route declares
 * `@Permission(...keys)`, `@SignedIn()` or `@Public()`; the global `PermissionGuard` refuses the
 * rest. No Nest module: the guard is registered in app.module (after the JWT guard).
 */
export {
  Permission,
  Public,
  SignedIn,
  permissionDeclarationOf,
  type PermissionDeclaration,
} from './decorators/permission.decorator';
export { PermissionGuard } from './guards/permission.guard';
export { permissionsFor } from './permissions-for';

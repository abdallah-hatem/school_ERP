/*
 * core/permissions (spec docs/specs/2026-11-17-roles-permissions.md, P1 + P2). Every route
 * declares `@Permission(...keys)`, `@SignedIn()` or `@Public()`; the global `PermissionGuard`
 * (registered in app.module) refuses the rest. What a user holds comes from their roles in the
 * database: `PermissionsService.permissionsFor(user)`; which rows a permission covers:
 * `PermissionsService.scopeFor(user, key)`.
 */
export {
  Permission,
  Public,
  SignedIn,
  permissionDeclarationOf,
  type PermissionDeclaration,
} from './decorators/permission.decorator';
export { PermissionGuard } from './guards/permission.guard';
export { PermissionsModule } from './permissions.module';
export { PermissionsService, type UserScope } from './permissions.service';

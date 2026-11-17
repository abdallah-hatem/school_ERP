import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hasPermissions, type AuthUser } from '@school-erp/shared';
import { permissionDeclarationOf } from '../decorators/permission.decorator';
import { PermissionsService } from '../permissions.service';

/**
 * The global permission check (R3), registered as `APP_GUARD` right after `JwtAuthGuard`, so a
 * signed-out caller gets 401 before any 403. Closed by default:
 * - `@Public()` → passes;
 * - no user on the request → 401;
 * - `@SignedIn()` → passes;
 * - `@Permission(...keys)` → passes only if the user holds every key (through their roles), else 403;
 * - no declaration (or conflicting ones) → 403 (edge case 1). CI also fails on it
 *   (`permission-declarations.spec.ts`).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly permissions: PermissionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declaration = permissionDeclarationOf(context.getHandler(), context.getClass());
    if (declaration.kind === 'public') return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new UnauthorizedException();
    if (declaration.kind === 'signed-in') return true;
    if (
      declaration.kind === 'permission' &&
      hasPermissions(await this.permissions.permissionsFor(user), declaration.keys)
    ) {
      return true;
    }
    throw new ForbiddenException();
  }
}

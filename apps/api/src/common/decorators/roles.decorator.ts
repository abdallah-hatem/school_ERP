import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@school-erp/shared';

export const ROLES_KEY = 'roles';

/** Only these roles may call the route (checked by `RolesGuard`, after the JWT guard). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { GrantsRepository } from './repositories/grants.repository';

/**
 * core/permissions — what a user holds (`permissionsFor`, `scopeFor`). Read-only: the roles
 * tables are written by core/roles. The global `PermissionGuard` is registered in app.module.
 */
@Module({
  providers: [PermissionsService, GrantsRepository],
  exports: [PermissionsService],
})
export class PermissionsModule {}

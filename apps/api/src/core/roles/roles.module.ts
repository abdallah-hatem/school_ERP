import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { PermissionsModule } from '../permissions';
import { RolesRepository } from './repositories/roles.repository';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

/** core/roles — roles, their permissions and scopes, and who holds them. Exports only the service. */
@Module({
  imports: [AuditModule, PermissionsModule],
  controllers: [RolesController],
  providers: [RolesService, RolesRepository],
  exports: [RolesService],
})
export class RolesModule {}

import { Module } from '@nestjs/common';
import { AuditModule } from './audit';
import { AuthModule } from './auth';
import { PermissionsModule } from './permissions';
import { RolesModule } from './roles';
import { SchoolStructureModule } from './school-structure';
import { SettingsModule } from './settings';
import { UsersModule } from './users';

/** The business foundation every module relies on. */
@Module({
  imports: [
    AuditModule,
    PermissionsModule,
    RolesModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    SchoolStructureModule,
  ],
  exports: [
    AuditModule,
    PermissionsModule,
    RolesModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    SchoolStructureModule,
  ],
})
export class CoreModule {}

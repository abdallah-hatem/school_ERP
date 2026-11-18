import { Module } from '@nestjs/common';
import { AuditModule } from './audit';
import { AuthModule } from './auth';
import { JobsModule } from './jobs';
import { PermissionsModule } from './permissions';
import { RolesModule } from './roles';
import { SchoolStructureModule } from './school-structure';
import { SettingsModule } from './settings';
import { SignInLimitModule } from './sign-in-limit';
import { UsersModule } from './users';

/** The business foundation every module relies on. */
@Module({
  imports: [
    JobsModule,
    AuditModule,
    PermissionsModule,
    RolesModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    SignInLimitModule,
    SchoolStructureModule,
  ],
  exports: [
    JobsModule,
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

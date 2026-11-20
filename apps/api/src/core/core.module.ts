import { Module } from '@nestjs/common';
import { AuditModule } from './audit';
import { AuthModule } from './auth';
import { EventsModule } from './events';
import { JobsModule } from './jobs';
import { NotificationsModule } from './notifications';
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
    EventsModule,
    AuditModule,
    PermissionsModule,
    RolesModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    SignInLimitModule,
    SchoolStructureModule,
    NotificationsModule,
  ],
  exports: [
    JobsModule,
    EventsModule,
    AuditModule,
    PermissionsModule,
    RolesModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    SchoolStructureModule,
    NotificationsModule,
  ],
})
export class CoreModule {}

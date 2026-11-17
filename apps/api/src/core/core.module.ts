import { Module } from '@nestjs/common';
import { AuditModule } from './audit';
import { AuthModule } from './auth';
import { SchoolStructureModule } from './school-structure';
import { SettingsModule } from './settings';
import { UsersModule } from './users';

/** The business foundation every module relies on. */
@Module({
  imports: [AuditModule, AuthModule, UsersModule, SettingsModule, SchoolStructureModule],
  exports: [AuditModule, AuthModule, UsersModule, SettingsModule, SchoolStructureModule],
})
export class CoreModule {}

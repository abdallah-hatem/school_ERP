import { Module } from '@nestjs/common';
import { AuthModule } from './auth';
import { SchoolStructureModule } from './school-structure';
import { SettingsModule } from './settings';
import { UsersModule } from './users';

/** The business foundation every module relies on. */
@Module({
  imports: [AuthModule, UsersModule, SettingsModule, SchoolStructureModule],
  exports: [AuthModule, UsersModule, SettingsModule, SchoolStructureModule],
})
export class CoreModule {}

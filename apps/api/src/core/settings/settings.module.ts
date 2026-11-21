import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { AppIconsService } from './files/app-icons.service';
import { FileStorageService } from './files/file-storage.service';
import { FilesController } from './files/files.controller';
import { SchoolSettingRepository } from './repositories/school-setting.repository';
import { SettingsHistory } from './settings-history';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/** core/settings — school-wide settings, change history (written to and read from the audit log), logo, the app icons drawn from it, and uploaded files. */
@Module({
  imports: [AuditModule],
  controllers: [SettingsController, FilesController],
  providers: [
    SettingsService,
    FileStorageService,
    AppIconsService,
    SettingsHistory,
    SchoolSettingRepository,
  ],
  exports: [SettingsService, SettingsHistory, FileStorageService],
})
export class SettingsModule {}

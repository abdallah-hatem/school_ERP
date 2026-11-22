import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { PermissionsModule } from '../permissions';
import { FileFolders } from './files/file-folders';
import { AppIconsService } from './files/app-icons.service';
import { FileStorageService } from './files/file-storage.service';
import { FilesController } from './files/files.controller';
import { LegacySvgLogos } from './files/svg-logo';
import { SchoolSettingRepository } from './repositories/school-setting.repository';
import { SettingsHistory } from './settings-history';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/** core/settings — school-wide settings, change history (written to and read from the audit log), logo, the app icons drawn from it, and uploaded files. */
@Module({
  imports: [AuditModule, PermissionsModule],
  controllers: [SettingsController, FilesController],
  providers: [
    SettingsService,
    FileStorageService,
    FileFolders,
    AppIconsService,
    LegacySvgLogos,
    SettingsHistory,
    SchoolSettingRepository,
  ],
  exports: [SettingsService, SettingsHistory, FileStorageService, FileFolders],
})
export class SettingsModule {}

import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { FileStorageService } from './files/file-storage.service';
import { FilesController } from './files/files.controller';
import { SchoolSettingRepository } from './repositories/school-setting.repository';
import { SettingsHistoryListener } from './settings-history.listener';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/** core/settings — school-wide settings, change history (read from the audit log), logo and uploaded files. */
@Module({
  imports: [AuditModule],
  controllers: [SettingsController, FilesController],
  providers: [
    SettingsService,
    FileStorageService,
    SettingsHistoryListener,
    SchoolSettingRepository,
  ],
  exports: [SettingsService, FileStorageService],
})
export class SettingsModule {}

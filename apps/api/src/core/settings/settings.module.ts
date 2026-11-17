import { Module } from '@nestjs/common';
import { FileStorageService } from './files/file-storage.service';
import { FilesController } from './files/files.controller';
import { SchoolSettingRepository } from './repositories/school-setting.repository';
import { SettingChangeRepository } from './repositories/setting-change.repository';
import { SettingsHistoryListener } from './settings-history.listener';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/** core/settings — school-wide settings, change history, logo and uploaded files. */
@Module({
  controllers: [SettingsController, FilesController],
  providers: [
    SettingsService,
    FileStorageService,
    SettingsHistoryListener,
    SchoolSettingRepository,
    SettingChangeRepository,
  ],
  exports: [SettingsService, FileStorageService],
})
export class SettingsModule {}

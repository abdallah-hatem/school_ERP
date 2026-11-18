import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { StageRepository } from './repositories/stage.repository';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';

/** core/school-structure — stages. */
@Module({
  imports: [SettingsModule],
  controllers: [StagesController],
  providers: [StagesService, StageRepository],
  exports: [StagesService],
})
export class SchoolStructureModule {}

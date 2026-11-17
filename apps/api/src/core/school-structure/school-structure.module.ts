import { Module } from '@nestjs/common';
import { StageRepository } from './repositories/stage.repository';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';

/** core/school-structure — stages. */
@Module({
  controllers: [StagesController],
  providers: [StagesService, StageRepository],
  exports: [StagesService],
})
export class SchoolStructureModule {}

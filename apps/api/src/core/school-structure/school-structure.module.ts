import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { StageRepository } from './repositories/stage.repository';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';

/** core/school-structure — stages. */
@Module({
  imports: [AuditModule],
  controllers: [StagesController],
  providers: [StagesService, StageRepository],
  exports: [StagesService],
})
export class SchoolStructureModule {}

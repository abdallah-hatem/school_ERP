import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HrListKey, JobTitle } from '@school-erp/shared';
import type { CreateJobTitleDto, UpdateJobTitleDto } from '../dto/list-item.dto';
import { JobTitlesRepository } from '../repositories/job-titles.repository';
import { ListItemsService } from './list-items.service';

/** Job titles: a list item plus `managesPeople` — who can be chosen as a direct manager (§3). */
@Injectable()
export class JobTitlesService extends ListItemsService<
  JobTitle,
  CreateJobTitleDto,
  UpdateJobTitleDto
> {
  constructor(repository: JobTitlesRepository, events: EventEmitter2) {
    super(repository, events, HrListKey.JOB_TITLES);
  }

  protected override extraCreateData(dto: CreateJobTitleDto): Record<string, unknown> {
    return dto.managesPeople !== undefined ? { managesPeople: dto.managesPeople } : {};
  }
}

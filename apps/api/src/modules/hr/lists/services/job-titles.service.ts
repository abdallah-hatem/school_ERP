import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HrListKey } from '@school-erp/shared';
import { JobTitlesRepository } from '../repositories/job-titles.repository';
import { ListItemsService } from './list-items.service';

@Injectable()
export class JobTitlesService extends ListItemsService {
  constructor(repository: JobTitlesRepository, events: EventEmitter2) {
    super(repository, events, HrListKey.JOB_TITLES);
  }
}

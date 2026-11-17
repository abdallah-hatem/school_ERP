import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HrListKey } from '@school-erp/shared';
import { DepartmentsRepository } from '../repositories/departments.repository';
import { ListItemsService } from './list-items.service';

@Injectable()
export class DepartmentsService extends ListItemsService {
  constructor(repository: DepartmentsRepository, events: EventEmitter2) {
    super(repository, events, HrListKey.DEPARTMENTS);
  }
}

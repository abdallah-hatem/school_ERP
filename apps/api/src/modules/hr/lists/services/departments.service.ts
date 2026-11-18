import { Injectable } from '@nestjs/common';
import { HrListKey } from '@school-erp/shared';
import { SettingsHistory } from '../../../../core/settings';
import { AfterCommit } from '../../../../database/transactions';
import { DepartmentsRepository } from '../repositories/departments.repository';
import { ListItemsService } from './list-items.service';

@Injectable()
export class DepartmentsService extends ListItemsService {
  constructor(
    repository: DepartmentsRepository,
    history: SettingsHistory,
    afterCommit: AfterCommit,
  ) {
    super(repository, history, afterCommit, HrListKey.DEPARTMENTS);
  }
}

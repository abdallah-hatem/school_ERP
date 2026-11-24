import { Injectable } from '@nestjs/common';
import { HrListKey } from '@school-erp/shared';
import { SettingsHistory } from '../../../../core/settings';
import { AfterCommit } from '../../../../database/transactions';
import { EmployeeGradesRepository } from '../repositories/employee-grades.repository';
import { ListItemsService } from './list-items.service';

@Injectable()
export class EmployeeGradesService extends ListItemsService {
  constructor(
    repository: EmployeeGradesRepository,
    history: SettingsHistory,
    afterCommit: AfterCommit,
  ) {
    super(repository, history, afterCommit, HrListKey.EMPLOYEE_GRADES);
  }
}

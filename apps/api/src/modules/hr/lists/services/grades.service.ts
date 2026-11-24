import { Injectable } from '@nestjs/common';
import { HrListKey } from '@school-erp/shared';
import { SettingsHistory } from '../../../../core/settings';
import { AfterCommit } from '../../../../database/transactions';
import { GradesRepository } from '../repositories/grades.repository';
import { ListItemsService } from './list-items.service';

@Injectable()
export class GradesService extends ListItemsService {
  constructor(
    repository: GradesRepository,
    history: SettingsHistory,
    afterCommit: AfterCommit,
  ) {
    super(repository, history, afterCommit, HrListKey.GRADES);
  }
}

import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { DatabaseService } from '../../../../database/database.service';
import type { DbAdapter } from '../../../../database/transactions';
import { ListItemsRepository } from './list-items.repository';

@Injectable()
export class DepartmentsRepository extends ListItemsRepository {
  constructor(databaseService: DatabaseService, txHost: TransactionHost<DbAdapter>) {
    super(databaseService, txHost, 'department');
  }
}

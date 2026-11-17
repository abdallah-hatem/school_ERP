import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';
import { ListItemsRepository } from './list-items.repository';

@Injectable()
export class DepartmentsRepository extends ListItemsRepository {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'department');
  }
}

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';
import { ListItemsRepository } from './list-items.repository';

@Injectable()
export class JobTitlesRepository extends ListItemsRepository {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'jobTitle');
  }
}

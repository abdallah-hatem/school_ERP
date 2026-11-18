import { Injectable } from '@nestjs/common';
import type { JobTitle } from '@school-erp/shared';
import { TransactionHost } from '@nestjs-cls/transactional';
import { DatabaseService } from '../../../../database/database.service';
import type { DbAdapter } from '../../../../database/transactions';
import {
  LIST_ITEM_SELECT,
  ListItemData,
  ListItemsRepository,
  ListItemUpdateData,
} from './list-items.repository';

export type JobTitleData = ListItemData & { managesPeople?: boolean };
export type JobTitleUpdateData = ListItemUpdateData & { managesPeople?: boolean };

/** The shared list columns plus `managesPeople` (§3 direct managers). */
export const JOB_TITLE_SELECT = { ...LIST_ITEM_SELECT, managesPeople: true } as const;

@Injectable()
export class JobTitlesRepository extends ListItemsRepository<
  JobTitle,
  JobTitleData,
  JobTitleUpdateData
> {
  constructor(databaseService: DatabaseService, txHost: TransactionHost<DbAdapter>) {
    super(databaseService, txHost, 'jobTitle', JOB_TITLE_SELECT);
  }
}

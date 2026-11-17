import type { ListItem } from '@school-erp/shared';
import { BaseRepository, ModelName } from '../../../../common/repositories/base.repository';
import { DatabaseService } from '../../../../database/database.service';

export interface ListItemData {
  nameEn: string;
  nameAr: string;
  sortOrder?: number;
}
export type ListItemUpdateData = Partial<ListItemData> & { isActive?: boolean };

/** The columns that reach a response — the shared `ListItem` shape. */
export const LIST_ITEM_SELECT = {
  id: true,
  nameEn: true,
  nameAr: true,
  sortOrder: true,
  isActive: true,
} as const;

/** The subset of the Department / JobTitle delegates used here, with `select`. */
interface ListDelegate {
  findMany(args: {
    where?: { isActive?: boolean };
    orderBy: unknown;
    select: typeof LIST_ITEM_SELECT;
  }): Promise<ListItem[]>;
  findUnique(args: {
    where: { id: string };
    select: typeof LIST_ITEM_SELECT;
  }): Promise<ListItem | null>;
  create(args: { data: ListItemData; select: typeof LIST_ITEM_SELECT }): Promise<ListItem>;
  update(args: {
    where: { id: string };
    data: ListItemUpdateData;
    select: typeof LIST_ITEM_SELECT;
  }): Promise<ListItem>;
}

/** Departments and job titles share one table shape, so one repository class serves both. */
export abstract class ListItemsRepository extends BaseRepository<
  ListItem,
  ListItemData,
  ListItemUpdateData
> {
  protected constructor(databaseService: DatabaseService, modelName: ModelName) {
    super(databaseService, modelName);
  }

  private get list(): ListDelegate {
    return this.databaseService[this.modelName] as unknown as ListDelegate;
  }

  findAllOrdered(includeHidden: boolean): Promise<ListItem[]> {
    return this.list.findMany({
      where: includeHidden ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      select: LIST_ITEM_SELECT,
    });
  }

  findOne(id: string): Promise<ListItem | null> {
    return this.list.findUnique({ where: { id }, select: LIST_ITEM_SELECT });
  }

  createItem(data: ListItemData): Promise<ListItem> {
    return this.list.create({ data, select: LIST_ITEM_SELECT });
  }

  updateItem(id: string, data: ListItemUpdateData): Promise<ListItem> {
    return this.list.update({ where: { id }, data, select: LIST_ITEM_SELECT });
  }
}

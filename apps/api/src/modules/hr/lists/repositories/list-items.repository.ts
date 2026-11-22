import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ListItem, Paginated } from '@school-erp/shared';
import { BaseRepository, ModelName } from '../../../../common/repositories/base.repository';
import { DatabaseService } from '../../../../database/database.service';
import type { DbAdapter } from '../../../../database/transactions';

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

/** A `select` covering at least the `ListItem` columns (job titles add `managesPeople`). */
export type ListItemSelect = typeof LIST_ITEM_SELECT & Partial<Record<string, true>>;

/** The subset of the Department / JobTitle delegates used here, with `select`. */
interface ListDelegate<T, D, U> {
  findMany(args: {
    where?: { isActive?: boolean };
    orderBy: unknown;
    select: ListItemSelect;
  }): Promise<T[]>;
  findUnique(args: { where: { id: string }; select: ListItemSelect }): Promise<T | null>;
  create(args: { data: D; select: ListItemSelect }): Promise<T>;
  update(args: { where: { id: string }; data: U; select: ListItemSelect }): Promise<T>;
}

/**
 * Departments and job titles share one table shape, so one repository class serves both. A list
 * with extra columns (job titles' `managesPeople`) passes its own wider types and `select`.
 * Its own queries run in the caller's transaction when one is open, so an edit and its history
 * commit together.
 */
export abstract class ListItemsRepository<
  T extends ListItem = ListItem,
  D extends ListItemData = ListItemData,
  U extends ListItemUpdateData = ListItemUpdateData,
> extends BaseRepository<T, D, U> {
  protected constructor(
    databaseService: DatabaseService,
    private readonly txHost: TransactionHost<DbAdapter>,
    modelName: ModelName,
    private readonly select: ListItemSelect = LIST_ITEM_SELECT,
  ) {
    super(databaseService, modelName);
  }

  private get list(): ListDelegate<T, D, U> {
    return this.txHost.tx[this.modelName] as unknown as ListDelegate<T, D, U>;
  }

  findAllOrdered(includeHidden: boolean): Promise<T[]> {
    return this.list.findMany({
      where: includeHidden ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      select: this.select,
    });
  }

  /** One page (by order, then English name), searched by either name (the shared search). */
  findPage(includeHidden: boolean, page?: number, limit?: number, search?: string, ids?: string[]): Promise<Paginated<T>> {
    return this.findAllWithPagination(
      page,
      limit,
      search || undefined,
      { ...(includeHidden ? {} : { isActive: true }), ...(ids ? { id: { in: ids } } : {}) },
      { select: this.select, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }] },
    );
  }

  findOne(id: string): Promise<T | null> {
    return this.list.findUnique({ where: { id }, select: this.select });
  }

  createItem(data: D): Promise<T> {
    return this.list.create({ data, select: this.select });
  }

  updateItem(id: string, data: U): Promise<T> {
    return this.list.update({ where: { id }, data, select: this.select });
  }
}

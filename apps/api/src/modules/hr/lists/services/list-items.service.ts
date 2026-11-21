import { HttpStatus, NotFoundException } from '@nestjs/common';
import { ErrorCode, HrListKey, ListItem, Paginated, Uuid } from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { SettingsHistory } from '../../../../core/settings';
import { AfterCommit } from '../../../../database/transactions';
import type { CreateListItemDto, UpdateListItemDto } from '../dto/list-item.dto';
import type {
  ListItemData,
  ListItemsRepository,
  ListItemUpdateData,
} from '../repositories/list-items.repository';

/**
 * Departments and job titles (§3 lists). No delete: an item is hidden (`isActive: false`) and
 * stays on the employees that use it. Every create / change records its history entry (§7) through
 * core's `SettingsHistory`, in the write's own transaction — both commit or neither does.
 */
export abstract class ListItemsService<
  T extends ListItem = ListItem,
  C extends CreateListItemDto = CreateListItemDto,
  U extends UpdateListItemDto = UpdateListItemDto,
> {
  protected constructor(
    protected readonly repository: ListItemsRepository<T, ListItemData, ListItemUpdateData>,
    private readonly history: SettingsHistory,
    private readonly afterCommit: AfterCommit,
    private readonly historyKey: HrListKey,
  ) {}

  list(includeHidden = false): Promise<T[]> {
    return this.repository.findAllOrdered(includeHidden);
  }

  /** One page of the list (the Settings screen), searched by either name. */
  page(query: { includeHidden?: boolean; page?: number; limit?: number; search?: string; ids?: string[] }): Promise<Paginated<T>> {
    return this.repository.findPage(query.includeHidden ?? false, query.page, query.limit, query.search, query.ids);
  }

  create(dto: C, changedById: Uuid | null): Promise<T> {
    return this.afterCommit.inTransaction(async () => {
      const item = await this.repository.createItem({
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...this.extraCreateData(dto),
      });
      await this.recordChange(null, item, changedById);
      return item;
    });
  }

  /** A list's own columns on create (job titles: `managesPeople`). */
  protected extraCreateData(_dto: C): Record<string, unknown> {
    return {};
  }

  /** A save that changes nothing writes no history entry. */
  update(id: Uuid, dto: U, changedById: Uuid | null): Promise<T> {
    return this.afterCommit.inTransaction(async () => {
      const before = await this.repository.findOne(id);
      if (!before) throw new NotFoundException();
      const after = await this.repository.updateItem(id, dto);
      await this.recordChange(before, after, changedById);
      return after;
    });
  }

  /**
   * For a new choice on an employee: the item must exist (400 FOREIGN_KEY_VIOLATION) and not be
   * hidden (400 LIST_ITEM_HIDDEN).
   */
  async getSelectable(id: Uuid): Promise<T> {
    const item = await this.repository.findOne(id);
    if (!item) throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.FOREIGN_KEY_VIOLATION);
    if (!item.isActive)
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.LIST_ITEM_HIDDEN);
    return item;
  }

  private recordChange(oldValue: T | null, newValue: T, changedById: Uuid | null) {
    return this.history.record({
      scope: 'lists',
      key: this.historyKey,
      oldValue,
      newValue,
      changedById,
    });
  }
}

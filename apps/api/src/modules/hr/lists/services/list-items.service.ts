import { HttpStatus, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ErrorCode,
  HrListKey,
  ListItem,
  SettingsChangedEvent,
  SettingsEvent,
  Uuid,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import type { CreateListItemDto, UpdateListItemDto } from '../dto/list-item.dto';
import type {
  ListItemData,
  ListItemsRepository,
  ListItemUpdateData,
} from '../repositories/list-items.repository';

/** Every column the item carries (job titles add `managesPeople`) is the same. */
const sameItem = <T extends ListItem>(a: T, b: T) =>
  (Object.keys(b) as (keyof T)[]).every((k) => a[k] === b[k]);

/**
 * Departments and job titles (§3 lists). No delete: an item is hidden (`isActive: false`) and
 * stays on the employees that use it. Every create / change emits `settings.changed` (scope
 * `lists`) after the write, and core's listener records the history row (§7).
 */
export abstract class ListItemsService<
  T extends ListItem = ListItem,
  C extends CreateListItemDto = CreateListItemDto,
  U extends UpdateListItemDto = UpdateListItemDto,
> {
  protected constructor(
    protected readonly repository: ListItemsRepository<T, ListItemData, ListItemUpdateData>,
    private readonly events: EventEmitter2,
    private readonly historyKey: HrListKey,
  ) {}

  list(includeHidden = false): Promise<T[]> {
    return this.repository.findAllOrdered(includeHidden);
  }

  async create(dto: C, changedById: Uuid | null): Promise<T> {
    const item = await this.repository.createItem({
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...this.extraCreateData(dto),
    });
    this.emitChange(null, item, changedById);
    return item;
  }

  /** A list's own columns on create (job titles: `managesPeople`). */
  protected extraCreateData(_dto: C): Record<string, unknown> {
    return {};
  }

  async update(id: Uuid, dto: U, changedById: Uuid | null): Promise<T> {
    const before = await this.repository.findOne(id);
    if (!before) throw new NotFoundException();
    const after = await this.repository.updateItem(id, dto);
    if (!sameItem(before, after)) this.emitChange(before, after, changedById);
    return after;
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

  private emitChange(oldValue: T | null, newValue: T, changedById: Uuid | null) {
    const event: SettingsChangedEvent = {
      scope: 'lists',
      key: this.historyKey,
      oldValue,
      newValue,
      changedById,
      changedAt: new Date().toISOString(),
    };
    this.events.emit(SettingsEvent.CHANGED, event);
  }
}

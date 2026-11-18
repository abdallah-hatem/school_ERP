import { HttpStatus, NotFoundException } from '@nestjs/common';
import {
  ErrorCode,
  HrListKey,
  ListItem,
  Uuid,
  type AuditAction,
  type AuditEntityType,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import type { AuditService } from '../../../../core/audit';
import type { AfterCommit } from '../../../../database/transactions';
import type { CreateListItemDto, UpdateListItemDto } from '../dto/list-item.dto';
import type {
  ListItemData,
  ListItemsRepository,
  ListItemUpdateData,
} from '../repositories/list-items.repository';

/** What a list records in the audit log: its record type and its two actions. */
export interface ListAudit {
  type: AuditEntityType;
  create: AuditAction;
  update: AuditAction;
}

/**
 * Departments and job titles (§3 lists). No delete: an item is hidden (`isActive: false`) and
 * stays on the employees that use it. Every create / change is recorded in the audit log in the
 * write's transaction (D2), shaped like the old history row — the field is the list's history key
 * (`hr.departments`), the values whole snapshots — so Settings history reads as before (§7).
 */
export abstract class ListItemsService<
  T extends ListItem = ListItem,
  C extends CreateListItemDto = CreateListItemDto,
  U extends UpdateListItemDto = UpdateListItemDto,
> {
  protected constructor(
    protected readonly repository: ListItemsRepository<T, ListItemData, ListItemUpdateData>,
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
    private readonly historyKey: HrListKey,
    private readonly auditAs: ListAudit,
  ) {}

  list(includeHidden = false): Promise<T[]> {
    return this.repository.findAllOrdered(includeHidden);
  }

  async create(dto: C): Promise<T> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      const item = await this.repository.createItem({
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...this.extraCreateData(dto),
      });
      await this.record(null, item);
      return item;
    });
  }

  /** A list's own columns on create (job titles: `managesPeople`). */
  protected extraCreateData(_dto: C): Record<string, unknown> {
    return {};
  }

  async update(id: Uuid, dto: U): Promise<T> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      const before = await this.repository.findOne(id);
      if (!before) throw new NotFoundException();
      const after = await this.repository.updateItem(id, dto);
      // Always recorded: an unchanged save writes no entry but still answers `@Audited` (D6b).
      await this.record(before, after);
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

  private record(before: T | null, after: T): Promise<void> {
    return this.audit.record({
      action: before ? this.auditAs.update : this.auditAs.create,
      entity: { type: this.auditAs.type, id: after.id, label: { en: after.nameEn, ar: after.nameAr } },
      changes: [{ field: this.historyKey, before, after }],
    });
  }
}

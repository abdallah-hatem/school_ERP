import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AuditEntityType, ErrorCode, type Stage } from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import { AfterCommit } from '../../database/transactions';
import { AuditService } from '../audit';
import type { CreateListItemDto, UpdateListItemDto } from './dto/list-item.dto';
import { StageRepository } from './repositories/stage.repository';

/** History key of a stage's change (the field of its audit entry, as Settings history read it). */
export const stageHistoryKey = (id: string) => `lists.stages.${id}`;

/**
 * Stages (school structure, §3). Other modules use `getActiveById` to accept a stage for a new
 * choice (an employee's stage) and `getById` to show one that may be hidden.
 */
@Injectable()
export class StagesService {
  constructor(
    private readonly stages: StageRepository,
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
  ) {}

  list(includeHidden = false): Promise<Stage[]> {
    return this.stages.findMany(includeHidden);
  }

  async getById(id: string): Promise<Stage> {
    const stage = await this.stages.findById(id);
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }

  /** The stage, if it may be chosen now: 404 when missing, `LIST_ITEM_HIDDEN` (400) when hidden. */
  async getActiveById(id: string): Promise<Stage> {
    const stage = await this.getById(id);
    if (!stage.isActive)
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.LIST_ITEM_HIDDEN);
    return stage;
  }

  async create(dto: CreateListItemDto): Promise<Stage> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      const stage = await this.stages.create({
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        sortOrder: dto.sortOrder ?? (await this.stages.nextSortOrder()),
      });
      await this.recordChange(null, stage);
      return stage;
    });
  }

  /** Hiding a stage in use is allowed: existing employees keep it, new choices can't pick it. */
  async update(id: string, dto: UpdateListItemDto): Promise<Stage> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      const before = await this.getById(id);
      const stage = await this.stages.update(id, {
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      });
      // Always recorded: an unchanged save writes no entry but still answers `@Audited` (D6b).
      await this.recordChange(before, stage);
      return stage;
    });
  }

  /**
   * One audit entry in the write's transaction (D2), shaped like the old history row: the field is
   * the stage's history key, the values whole snapshots — so Settings history reads as before.
   */
  private recordChange(before: Stage | null, after: Stage): Promise<void> {
    return this.audit.record({
      action: before ? 'core.stage.update' : 'core.stage.create',
      entity: { type: AuditEntityType.STAGE, id: after.id, label: { en: after.nameEn, ar: after.nameAr } },
      changes: [{ field: stageHistoryKey(after.id), before, after }],
    });
  }
}

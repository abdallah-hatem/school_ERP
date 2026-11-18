import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode, type Stage } from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import { AfterCommit } from '../../database/transactions';
import { SettingsHistory } from '../settings';
import type { CreateListItemDto, UpdateListItemDto } from './dto/list-item.dto';
import { StageRepository } from './repositories/stage.repository';

/** History key of a stage's change rows. */
export const stageHistoryKey = (id: string) => `lists.stages.${id}`;

/**
 * Stages (school structure, §3). Other modules use `getActiveById` to accept a stage for a new
 * choice (an employee's stage) and `getById` to show one that may be hidden.
 */
@Injectable()
export class StagesService {
  constructor(
    private readonly stages: StageRepository,
    private readonly history: SettingsHistory,
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

  /** The stage and its history entry commit together (audit D2). */
  create(dto: CreateListItemDto, changedById: string | null): Promise<Stage> {
    return this.afterCommit.inTransaction(async () => {
      const stage = await this.stages.create({
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        sortOrder: dto.sortOrder ?? (await this.stages.nextSortOrder()),
      });
      await this.recordChange(stage.id, null, stage, changedById);
      return stage;
    });
  }

  /** Hiding a stage in use is allowed: existing employees keep it, new choices can't pick it. */
  /** The change and its history entry commit together; a save that changes nothing writes none. */
  update(id: string, dto: UpdateListItemDto, changedById: string | null): Promise<Stage> {
    return this.afterCommit.inTransaction(async () => {
      const before = await this.getById(id);
      const stage = await this.stages.update(id, {
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      });
      await this.recordChange(id, before, stage, changedById);
      return stage;
    });
  }

  /** In the write's transaction: one history entry (core/settings → the audit log). */
  private recordChange(
    id: string,
    oldValue: Stage | null,
    newValue: Stage,
    changedById: string | null,
  ): Promise<void> {
    return this.history.record({
      scope: 'lists',
      key: stageHistoryKey(id),
      oldValue,
      newValue,
      changedById,
    });
  }
}

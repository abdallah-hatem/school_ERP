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
 * A stage as its history keeps it: what a user can edit. `isNoStage` is left out — no screen sets
 * it (seed and migration only), so it is never a change of the user's.
 */
export function stageHistoryValue(stage: Stage): Omit<Stage, 'isNoStage'> {
  const { isNoStage: _isNoStage, ...value } = stage;
  return value;
}

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

  /**
   * Marks `id` as the "no stage" entry (§3) unless a stage already carries the mark — then that one
   * is returned unchanged, so there is never more than one. Seed only (no endpoint): the role is
   * the school's data, not something a user re-assigns. Neither the create nor the edit endpoint
   * can set or clear it, so renaming or hiding the stage keeps it.
   */
  async ensureNoStage(id: string): Promise<Stage> {
    const marked = await this.stages.findNoStage();
    if (marked) return marked;
    await this.getById(id);
    return this.stages.setNoStage(id);
  }

  /**
   * Hiding a stage in use is allowed: existing employees keep it, new choices can't pick it. The
   * change and its history entry commit together; a save that changes nothing writes none.
   */
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
      oldValue: oldValue && stageHistoryValue(oldValue),
      newValue: stageHistoryValue(newValue),
      changedById,
    });
  }
}

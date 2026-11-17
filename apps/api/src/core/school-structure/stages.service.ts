import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SettingsEvent,
  ErrorCode,
  type SettingsChangedEvent,
  type Stage,
} from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
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
    private readonly events: EventEmitter2,
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

  async create(dto: CreateListItemDto, changedById: string | null): Promise<Stage> {
    const stage = await this.stages.create({
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      sortOrder: dto.sortOrder ?? (await this.stages.nextSortOrder()),
    });
    await this.recordChange(stage.id, null, stage, changedById);
    return stage;
  }

  /** Hiding a stage in use is allowed: existing employees keep it, new choices can't pick it. */
  async update(id: string, dto: UpdateListItemDto, changedById: string | null): Promise<Stage> {
    const before = await this.getById(id);
    const stage = await this.stages.update(id, {
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });
    if (JSON.stringify(before) !== JSON.stringify(stage)) {
      await this.recordChange(id, before, stage, changedById);
    }
    return stage;
  }

  /** After the write has committed: one history row via core/settings' listener. */
  private async recordChange(
    id: string,
    oldValue: Stage | null,
    newValue: Stage,
    changedById: string | null,
  ): Promise<void> {
    const event: SettingsChangedEvent = {
      scope: 'lists',
      key: stageHistoryKey(id),
      oldValue,
      newValue,
      changedById,
      changedAt: new Date().toISOString(),
    };
    await this.events.emitAsync(SettingsEvent.CHANGED, event);
  }
}

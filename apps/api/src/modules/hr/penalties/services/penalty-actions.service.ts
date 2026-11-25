import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  ErrorCode,
  HrCatalogueKey,
  PenaltyEffect,
  type Paginated,
  type PenaltyAction,
  type PenaltyActionItem,
  type Uuid,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { SettingsHistory } from '../../../../core/settings';
import { AfterCommit } from '../../../../database/transactions';
import type { ActionSnapshot } from '../../domain';
import type { CreatePenaltyActionDto, ListPenaltyActionsQueryDto, UpdatePenaltyActionDto } from '../dto/penalty-action.dto';
import {
  PenaltyActionNameTaken,
  PenaltyActionsRepository,
  type ActionUsage,
  type PenaltyActionRow,
} from '../repositories/penalty-actions.repository';

/** What the history (§7) and the audit entry keep of an action: names, effect, base, order, shown. */
type ActionHistory = Omit<PenaltyActionItem, 'levelsUsing' | 'violationsUsing' | 'code'>;

function toHistory(row: PenaltyActionRow): ActionHistory {
  return {
    id: row.id,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    effect: row.effect,
    percentBase: row.percentBase,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function toItem(row: PenaltyActionRow, usage: ActionUsage | undefined): PenaltyActionItem {
  return {
    ...toHistory(row),
    code: row.code as PenaltyAction | null,
    levelsUsing: usage?.levels ?? 0,
    violationsUsing: usage?.violations ?? 0,
  };
}

/** A row → what a level names and a penalty copies (the snapshot). */
export function toActionSnapshot(row: Pick<PenaltyActionRow, 'id' | 'nameEn' | 'nameAr' | 'effect' | 'percentBase'>): ActionSnapshot {
  return { id: row.id, nameEn: row.nameEn, nameAr: row.nameAr, effect: row.effect, percentBase: row.percentBase };
}

const taken = () => new CodedException(HttpStatus.CONFLICT, ErrorCode.PENALTY_ACTION_NAME_TAKEN);

/**
 * The school's Penalty actions list (spec 2026-11-25, §4 / §7): add, rename, reorder, hide, show —
 * never deleted. Each action has one effect, fixed once added (and, for a %, its salary base); the
 * numbers live on the catalogue levels. Every create / change records its history entry
 * (`hr.penalty_action.*`, Settings → View change history) through core's `SettingsHistory`, in the
 * write's own transaction.
 */
@Injectable()
export class PenaltyActionsService {
  constructor(
    private readonly repository: PenaltyActionsRepository,
    private readonly history: SettingsHistory,
    private readonly afterCommit: AfterCommit,
  ) {}

  /** The whole list in its order (the level editor's picker), each with how many levels use it. */
  async list(includeHidden = false): Promise<PenaltyActionItem[]> {
    const rows = await this.repository.findAllOrdered(includeHidden);
    const usage = await this.repository.usage(rows.map((r) => r.id));
    return rows.map((r) => toItem(r, usage.get(r.id)));
  }

  /** One page (Settings), searched by either name by the API. */
  async page(query: ListPenaltyActionsQueryDto): Promise<Paginated<PenaltyActionItem>> {
    const page = await this.repository.findPage(query.includeHidden ?? false, query.page, query.limit, query.search);
    const usage = await this.repository.usage(page.data.map((r) => r.id));
    return { ...page, data: page.data.map((r) => toItem(r, usage.get(r.id))) };
  }

  /**
   * A new action, after the last one unless `sortOrder` says otherwise. A % action needs its base;
   * no other effect takes one (400). `code` is the seed's (the ten seeded actions), never a client's.
   */
  create(dto: CreatePenaltyActionDto, changedById: Uuid | null, code: PenaltyAction | null = null): Promise<PenaltyActionItem> {
    const needsBase = dto.effect === PenaltyEffect.DEDUCT_PERCENT;
    const hasBase = dto.percentBase !== undefined && dto.percentBase !== null;
    if (needsBase !== hasBase) throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED);
    return this.afterCommit.inTransaction(async () => {
      const sortOrder = dto.sortOrder ?? (await this.repository.maxSortOrder()) + 1;
      const row = await this.repository
        .createAction({
          code,
          nameEn: dto.nameEn,
          nameAr: dto.nameAr,
          effect: dto.effect,
          percentBase: hasBase ? dto.percentBase! : null,
          sortOrder,
        })
        .catch((e: unknown) => {
          throw e instanceof PenaltyActionNameTaken ? taken() : e;
        });
      await this.recordChange(null, row, changedById);
      return toItem(row, { levels: 0, violations: 0 });
    });
  }

  /** Rename, reorder, hide, show. The effect and base can't change (400). A save that changes nothing writes no entry. */
  update(id: Uuid, dto: UpdatePenaltyActionDto, changedById: Uuid | null): Promise<PenaltyActionItem> {
    if (dto.effect !== undefined || dto.percentBase !== undefined) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.PENALTY_ACTION_EFFECT_LOCKED);
    }
    return this.afterCommit.inTransaction(async () => {
      const before = await this.repository.findOne(id);
      if (!before) throw new NotFoundException();
      const { effect: _effect, percentBase: _base, ...fields } = dto;
      const after = await this.repository.updateAction(id, fields).catch((e: unknown) => {
        throw e instanceof PenaltyActionNameTaken ? taken() : e;
      });
      await this.recordChange(before, after, changedById);
      const usage = await this.repository.usage([id]);
      return toItem(after, usage.get(id));
    });
  }

  /** The actions of these ids (the catalogue checks a level's pick), by id. */
  async byIds(ids: readonly Uuid[]): Promise<Map<Uuid, PenaltyActionRow>> {
    const rows = await this.repository.findByIds([...new Set(ids)]);
    return new Map(rows.map((r) => [r.id, r]));
  }

  /** The seed's: the actions with these codes, by code. */
  async byCodes(codes: readonly string[]): Promise<Map<string, PenaltyActionRow>> {
    const rows = await this.repository.findByCodes(codes);
    return new Map(rows.map((r) => [r.code!, r]));
  }

  private recordChange(before: PenaltyActionRow | null, after: PenaltyActionRow, changedById: Uuid | null) {
    return this.history.record({
      scope: 'catalogue',
      key: HrCatalogueKey.PENALTY_ACTIONS,
      oldValue: before ? toHistory(before) : null,
      newValue: toHistory(after),
      changedById,
    });
  }
}

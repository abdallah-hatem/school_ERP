import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  ErrorCode,
  HrCatalogueKey,
  matchesSearch,
  storedLevelDays,
  violationLevelsProblem,
  type PenaltyGroup,
  type Uuid,
  type Violation,
  type ViolationLevel,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { SettingsHistory } from '../../../../core/settings';
import { AfterCommit } from '../../../../database/transactions';
import type { CatalogueLevel } from '../../domain';
import { PenaltyActionsService, toActionSnapshot } from './penalty-actions.service';
import type {
  CreatePenaltyGroupDto,
  CreateViolationDto,
  UpdatePenaltyGroupDto,
  UpdateViolationDto,
  ViolationLevelDto,
} from '../dto/catalogue.dto';
import {
  PenaltyCatalogueRepository,
  type GroupRow,
  type LevelData,
  type LevelRow,
  type ViolationRow,
} from '../repositories/penalty-catalogue.repository';

type GroupSnapshot = Omit<PenaltyGroup, 'violations'>;
type ViolationSnapshot = Violation & { groupId: Uuid };

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** A stored level (Prisma Decimal days / percent) → the contract's level, with today's action. */
export function toLevel(row: LevelRow): ViolationLevel {
  return {
    level: row.level,
    action: { ...toActionSnapshot(row.action), isActive: row.action.isActive },
    days: num(row.days),
    percent: num(row.percent),
    amount: row.amount,
  };
}

/** A stored level → what the domain resolves and a penalty copies (the action as a snapshot). */
export function toCatalogueLevel(row: LevelRow): CatalogueLevel {
  return {
    level: row.level,
    action: toActionSnapshot(row.action),
    days: num(row.days),
    percent: num(row.percent),
    amount: row.amount,
  };
}

function toViolation(row: ViolationRow): ViolationSnapshot {
  return {
    id: row.id,
    groupId: row.groupId,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    note: row.note,
    isActive: row.isActive,
    oncePerDay: row.oncePerDay,
    levels: row.levels.map(toLevel),
  };
}

function toGroup(row: GroupRow): GroupSnapshot {
  return {
    id: row.id,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

/** Levels as stored: sorted, and each number null when absent. */
function toLevelData(levels: readonly ViolationLevelDto[]): LevelData[] {
  return [...levels]
    .sort((a, b) => a.level - b.level)
    .map((l) => ({
      level: l.level,
      actionId: l.actionId,
      days: l.days ?? null,
      percent: l.percent ?? null,
      amount: l.amount ?? null,
    }));
}

/** A violation that new penalties may use (§4, §7): exists, isn't retired, its group isn't. */
export interface UsableViolation {
  id: Uuid;
  levels: CatalogueLevel[];
  /** §4: at most one pending/approved penalty per employee per date. */
  oncePerDay: boolean;
}

/**
 * The penalty catalogue (§4, §7): groups → violations → levels 1–5. Nothing is deleted; a
 * violation used by approved penalties is retired (`isActive: false`). Every create / change
 * records its history entry through core's `SettingsHistory`, in the write's own transaction.
 * Approved penalties copied their level / action / days, so edits here never change them.
 */
@Injectable()
export class PenaltyCatalogueService {
  constructor(
    private readonly repository: PenaltyCatalogueRepository,
    private readonly history: SettingsHistory,
    private readonly afterCommit: AfterCommit,
    private readonly actions: PenaltyActionsService,
  ) {}

  /**
   * The catalogue, groups by order with their violations. With `search`: a group whose English or
   * Arabic name matches keeps every violation; otherwise only its violations whose name matches;
   * a group with none is left out — each with `match` (which matched, and the group's count).
   * `active` leaves out retired groups and violations (the record dialog's picker).
   */
  async list(search?: string, active = false): Promise<PenaltyGroup[]> {
    const rows = await this.repository.findGroupsWithViolations();
    const all: PenaltyGroup[] = rows.map((g) => ({
      ...toGroup(g),
      violations: g.violations.map((v) => {
        const { groupId: _groupId, ...violation } = toViolation(v);
        return violation;
      }),
    }));
    // `active`: only what can be recorded now — a retired group retires every violation in it (§4),
    // and a group left with none is left out.
    const groups = active
      ? all
          .filter((g) => g.isActive)
          .map((g) => ({ ...g, violations: g.violations.filter((v) => v.isActive) }))
          .filter((g) => g.violations.length > 0)
      : all;
    const query = search?.trim();
    if (!query) return groups;
    const found: PenaltyGroup[] = [];
    for (const group of groups) {
      const violationCount = group.violations.length;
      if (matchesSearch(query, [group.nameEn, group.nameAr])) {
        found.push({ ...group, match: { group: true, violationCount } });
        continue;
      }
      const violations = group.violations.filter((v) => matchesSearch(query, [v.nameEn, v.nameAr]));
      if (violations.length) found.push({ ...group, violations, match: { group: false, violationCount } });
    }
    return found;
  }

  /** Each write and its history entry commit together (audit D2). */
  createGroup(dto: CreatePenaltyGroupDto, changedById: Uuid | null): Promise<GroupSnapshot> {
    return this.afterCommit.inTransaction(async () => {
      const group = toGroup(
        await this.repository.createGroup({
          nameEn: dto.nameEn,
          nameAr: dto.nameAr,
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        }),
      );
      await this.recordChange(HrCatalogueKey.PENALTY_GROUPS, null, group, changedById);
      return group;
    });
  }

  /** A save that changes nothing writes no history entry. */
  updateGroup(
    id: Uuid,
    dto: UpdatePenaltyGroupDto,
    changedById: Uuid | null,
  ): Promise<GroupSnapshot> {
    return this.afterCommit.inTransaction(async () => {
      const before = await this.repository.findGroup(id);
      if (!before) throw new NotFoundException();
      const after = toGroup(await this.repository.updateGroup(id, dto));
      await this.recordChange(HrCatalogueKey.PENALTY_GROUPS, toGroup(before), after, changedById);
      return after;
    });
  }

  createViolation(
    groupId: Uuid,
    dto: CreateViolationDto,
    changedById: Uuid | null,
  ): Promise<ViolationSnapshot> {
    return this.afterCommit.inTransaction(async () => {
      if (!(await this.repository.findGroup(groupId))) throw new NotFoundException();
      const levels = await this.checkedLevels(dto.levels, []);
      const violation = toViolation(
        await this.repository.createViolation(
          groupId,
          {
            nameEn: dto.nameEn,
            nameAr: dto.nameAr,
            note: dto.note ?? null,
            ...(dto.oncePerDay !== undefined ? { oncePerDay: dto.oncePerDay } : {}),
          },
          levels,
        ),
      );
      await this.recordChange(HrCatalogueKey.VIOLATIONS, null, violation, changedById);
      return violation;
    });
  }

  /** A save that changes nothing writes no history entry. */
  updateViolation(
    id: Uuid,
    dto: UpdateViolationDto,
    changedById: Uuid | null,
  ): Promise<ViolationSnapshot> {
    return this.afterCommit.inTransaction(async () => {
      const before = await this.repository.findViolation(id);
      if (!before) throw new NotFoundException();
      const levels = dto.levels ? await this.checkedLevels(dto.levels, before.levels) : undefined;
      const { levels: _levels, ...fields } = dto;
      const after = toViolation(await this.repository.updateViolation(id, fields, levels));
      const { group: _group, ...beforeRow } = before;
      await this.recordChange(
        HrCatalogueKey.VIOLATIONS,
        toViolation(beforeRow),
        after,
        changedById,
      );
      return after;
    });
  }

  /**
   * For a new penalty or a preview: the violation must exist (400 FOREIGN_KEY_VIOLATION) and be
   * usable — not retired, and its group not retired (400 VIOLATION_RETIRED).
   */
  async getUsable(id: Uuid): Promise<UsableViolation> {
    const row = await this.repository.findViolation(id);
    if (!row) throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.FOREIGN_KEY_VIOLATION);
    if (!row.isActive || !row.group.isActive) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.VIOLATION_RETIRED);
    }
    return { id: row.id, levels: row.levels.map(toCatalogueLevel), oncePerDay: row.oncePerDay };
  }

  /**
   * The levels as they will be stored, or a 400 (spec 2026-11-25): each names an action that exists
   * (`PENALTY_ACTION_NOT_FOUND`); a hidden action only when the violation already uses it on one of
   * its levels — levels keep a hidden action, it just can't be picked anew (`PENALTY_ACTION_HIDDEN`);
   * then the shared rules on the count, numbering and each level's number for its action's effect
   * (`INVALID_LEVELS`, `params.problem`).
   */
  private async checkedLevels(levels: readonly ViolationLevelDto[], before: readonly LevelRow[]): Promise<LevelData[]> {
    const actions = await this.actions.byIds(levels.map((l) => l.actionId));
    const had = new Set(before.map((l) => l.action.id));
    for (const l of levels) {
      const action = actions.get(l.actionId);
      if (!action) throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.PENALTY_ACTION_NOT_FOUND);
      if (!action.isActive && !had.has(action.id)) {
        throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.PENALTY_ACTION_HIDDEN);
      }
    }
    const problem = violationLevelsProblem(levels.map((l) => ({ ...l, effect: actions.get(l.actionId)!.effect })));
    if (problem) throw CodedException.withParams(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_LEVELS, { problem });
    // An investigation's 0 days are stored as none (owner Q11).
    return toLevelData(levels.map((l) => ({ ...l, days: storedLevelDays(actions.get(l.actionId)!.effect, l.days) })));
  }

  private recordChange(
    key: HrCatalogueKey,
    oldValue: unknown,
    newValue: unknown,
    changedById: Uuid | null,
  ): Promise<void> {
    return this.history.record({ scope: 'catalogue', key, oldValue, newValue, changedById });
  }
}

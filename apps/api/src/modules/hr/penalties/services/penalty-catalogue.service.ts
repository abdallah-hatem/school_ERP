import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  ErrorCode,
  HrCatalogueKey,
  matchesSearch,
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
  type ViolationRow,
} from '../repositories/penalty-catalogue.repository';

type GroupSnapshot = Omit<PenaltyGroup, 'violations'>;
type ViolationSnapshot = Violation & { groupId: Uuid };

/** A stored level (Prisma Decimal days) → the contract's numbers. */
export function toLevel(row: { level: number; action: string; days: unknown }): ViolationLevel {
  return {
    level: row.level,
    action: row.action as ViolationLevel['action'],
    days: row.days === null || row.days === undefined ? null : Number(row.days),
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

/** Levels as stored: sorted, and `days` null when absent. */
function toLevelData(levels: readonly ViolationLevelDto[]): LevelData[] {
  return [...levels]
    .sort((a, b) => a.level - b.level)
    .map((l) => ({ level: l.level, action: l.action, days: l.days ?? null }));
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
  ) {}

  /**
   * The catalogue, groups by order with their violations. With `search`: a group whose English or
   * Arabic name matches keeps every violation; otherwise only its violations whose name matches;
   * a group with none is left out — each with `match` (which matched, and the group's count).
   */
  async list(search?: string): Promise<PenaltyGroup[]> {
    const rows = await this.repository.findGroupsWithViolations();
    const groups: PenaltyGroup[] = rows.map((g) => ({
      ...toGroup(g),
      violations: g.violations.map((v) => {
        const { groupId: _groupId, ...violation } = toViolation(v);
        return violation;
      }),
    }));
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
      const levels = this.checkedLevels(dto.levels);
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
      const levels = dto.levels ? this.checkedLevels(dto.levels) : undefined;
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
    return { id: row.id, levels: row.levels.map(toLevel), oncePerDay: row.oncePerDay };
  }

  private checkedLevels(levels: readonly ViolationLevelDto[]): LevelData[] {
    if (violationLevelsProblem(levels)) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_LEVELS);
    }
    return toLevelData(levels);
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

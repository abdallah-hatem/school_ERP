import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ErrorCode,
  HrCatalogueKey,
  SettingsEvent,
  violationLevelsProblem,
  type PenaltyGroup,
  type SettingsChangedEvent,
  type Uuid,
  type Violation,
  type ViolationLevel,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
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

/** Snapshots built by the mappers above have a fixed key order, so JSON equality is safe. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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
 * emits `settings.changed` (scope `catalogue`) after the write, for core's history listener.
 * Approved penalties copied their level / action / days, so edits here never change them.
 */
@Injectable()
export class PenaltyCatalogueService {
  constructor(
    private readonly repository: PenaltyCatalogueRepository,
    private readonly events: EventEmitter2,
  ) {}

  async list(): Promise<PenaltyGroup[]> {
    const rows = await this.repository.findGroupsWithViolations();
    return rows.map((g) => ({
      ...toGroup(g),
      violations: g.violations.map((v) => {
        const { groupId: _groupId, ...violation } = toViolation(v);
        return violation;
      }),
    }));
  }

  async createGroup(dto: CreatePenaltyGroupDto, changedById: Uuid | null): Promise<GroupSnapshot> {
    const group = toGroup(
      await this.repository.createGroup({
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      }),
    );
    this.emitChange(HrCatalogueKey.PENALTY_GROUPS, null, group, changedById);
    return group;
  }

  async updateGroup(
    id: Uuid,
    dto: UpdatePenaltyGroupDto,
    changedById: Uuid | null,
  ): Promise<GroupSnapshot> {
    const before = await this.repository.findGroup(id);
    if (!before) throw new NotFoundException();
    const after = toGroup(await this.repository.updateGroup(id, dto));
    const old = toGroup(before);
    if (!same(old, after)) this.emitChange(HrCatalogueKey.PENALTY_GROUPS, old, after, changedById);
    return after;
  }

  async createViolation(
    groupId: Uuid,
    dto: CreateViolationDto,
    changedById: Uuid | null,
  ): Promise<ViolationSnapshot> {
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
    this.emitChange(HrCatalogueKey.VIOLATIONS, null, violation, changedById);
    return violation;
  }

  async updateViolation(
    id: Uuid,
    dto: UpdateViolationDto,
    changedById: Uuid | null,
  ): Promise<ViolationSnapshot> {
    const before = await this.repository.findViolation(id);
    if (!before) throw new NotFoundException();
    const levels = dto.levels ? this.checkedLevels(dto.levels) : undefined;
    const { levels: _levels, ...fields } = dto;
    const after = toViolation(await this.repository.updateViolation(id, fields, levels));
    const { group: _group, ...beforeRow } = before;
    const old = toViolation(beforeRow);
    if (!same(old, after)) this.emitChange(HrCatalogueKey.VIOLATIONS, old, after, changedById);
    return after;
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

  private emitChange(
    key: HrCatalogueKey,
    oldValue: unknown,
    newValue: unknown,
    changedById: Uuid | null,
  ): void {
    const event: SettingsChangedEvent = {
      scope: 'catalogue',
      key,
      oldValue,
      newValue,
      changedById,
      changedAt: new Date().toISOString(),
    };
    this.events.emit(SettingsEvent.CHANGED, event);
  }
}

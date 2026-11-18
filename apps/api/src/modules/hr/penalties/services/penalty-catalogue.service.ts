import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  ErrorCode,
  HrCatalogueKey,
  violationLevelsProblem,
  type AuditAction,
  type PenaltyGroup,
  type Uuid,
  type Violation,
  type ViolationLevel,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { AuditService } from '../../../../core/audit';
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

/** What a catalogue record writes to the audit log: its type, history key and two actions. */
interface CatalogueAudit {
  type: AuditEntityType;
  historyKey: HrCatalogueKey;
  create: AuditAction;
  update: AuditAction;
}
const GROUP_AUDIT: CatalogueAudit = {
  type: AuditEntityType.PENALTY_GROUP,
  historyKey: HrCatalogueKey.PENALTY_GROUPS,
  create: 'hr.penalty_group.create',
  update: 'hr.penalty_group.update',
};
const VIOLATION_AUDIT: CatalogueAudit = {
  type: AuditEntityType.VIOLATION,
  historyKey: HrCatalogueKey.VIOLATIONS,
  create: 'hr.violation.create',
  update: 'hr.violation.update',
};

/** A violation that new penalties may use (§4, §7): exists, isn't retired, its group isn't. */
export interface UsableViolation {
  id: Uuid;
  levels: CatalogueLevel[];
  /** §4: at most one pending/approved penalty per employee per date. */
  oncePerDay: boolean;
}

/**
 * The penalty catalogue (§4, §7): groups → violations → levels 1–5. Nothing is deleted; a
 * violation used by approved penalties is retired (`isActive: false`). Every create / change is
 * recorded in the audit log in the write's transaction (D2), shaped like the old history row — the
 * field is the history key (`hr.penaltyGroups`), the values whole snapshots — for Settings history.
 * Approved penalties copied their level / action / days, so edits here never change them.
 */
@Injectable()
export class PenaltyCatalogueService {
  constructor(
    private readonly repository: PenaltyCatalogueRepository,
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
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

  async createGroup(dto: CreatePenaltyGroupDto): Promise<GroupSnapshot> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      const group = toGroup(
        await this.repository.createGroup({
          nameEn: dto.nameEn,
          nameAr: dto.nameAr,
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        }),
      );
      await this.record(GROUP_AUDIT, null, group);
      return group;
    });
  }

  async updateGroup(id: Uuid, dto: UpdatePenaltyGroupDto): Promise<GroupSnapshot> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      const before = await this.repository.findGroup(id);
      if (!before) throw new NotFoundException();
      const after = toGroup(await this.repository.updateGroup(id, dto));
      const old = toGroup(before);
      // Always recorded: an unchanged save writes no entry but still answers `@Audited` (D6b).
      await this.record(GROUP_AUDIT, old, after);
      return after;
    });
  }

  async createViolation(groupId: Uuid, dto: CreateViolationDto): Promise<ViolationSnapshot> {
    // The change and its audit entry commit together (audit D2), for the seed too.
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
      await this.record(VIOLATION_AUDIT, null, violation);
      return violation;
    });
  }

  async updateViolation(id: Uuid, dto: UpdateViolationDto): Promise<ViolationSnapshot> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      const before = await this.repository.findViolation(id);
      if (!before) throw new NotFoundException();
      const levels = dto.levels ? this.checkedLevels(dto.levels) : undefined;
      const { levels: _levels, ...fields } = dto;
      const after = toViolation(await this.repository.updateViolation(id, fields, levels));
      const { group: _group, ...beforeRow } = before;
      const old = toViolation(beforeRow);
      await this.record(VIOLATION_AUDIT, old, after);
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

  private record<T extends { id: Uuid; nameEn: string; nameAr: string }>(
    as: CatalogueAudit,
    before: T | null,
    after: T,
  ): Promise<void> {
    return this.audit.record({
      action: before ? as.update : as.create,
      entity: { type: as.type, id: after.id, label: { en: after.nameEn, ar: after.nameAr } },
      changes: [{ field: as.historyKey, before, after }],
    });
  }
}

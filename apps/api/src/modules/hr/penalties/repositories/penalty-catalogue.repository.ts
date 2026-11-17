import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PenaltyAction } from '@school-erp/shared';
import { DatabaseService } from '../../../../database/database.service';

export const LEVEL_SELECT = {
  level: true,
  action: true,
  days: true,
} satisfies Prisma.ViolationLevelSelect;

export const VIOLATION_SELECT = {
  id: true,
  groupId: true,
  nameEn: true,
  nameAr: true,
  note: true,
  isActive: true,
  levels: { select: LEVEL_SELECT, orderBy: { level: 'asc' } },
} satisfies Prisma.ViolationSelect;

export const GROUP_SELECT = {
  id: true,
  nameEn: true,
  nameAr: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.PenaltyGroupSelect;

export const GROUP_WITH_VIOLATIONS_SELECT = {
  ...GROUP_SELECT,
  violations: {
    select: VIOLATION_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.PenaltyGroupSelect;

export type GroupRow = Prisma.PenaltyGroupGetPayload<{ select: typeof GROUP_SELECT }>;
export type GroupWithViolationsRow = Prisma.PenaltyGroupGetPayload<{
  select: typeof GROUP_WITH_VIOLATIONS_SELECT;
}>;
export type ViolationRow = Prisma.ViolationGetPayload<{ select: typeof VIOLATION_SELECT }>;

/** A violation with what recording a penalty needs: its levels and whether it's usable. */
export type UsableViolationRow = ViolationRow & { group: { isActive: boolean } };

export interface LevelData {
  level: number;
  action: PenaltyAction;
  days: number | null;
}

export interface GroupData {
  nameEn: string;
  nameAr: string;
  sortOrder?: number;
}
export type GroupUpdateData = Partial<GroupData> & { isActive?: boolean };

export interface ViolationData {
  nameEn: string;
  nameAr: string;
  note: string | null;
}
export type ViolationUpdateData = Partial<ViolationData> & { isActive?: boolean };

/**
 * The penalty catalogue (§4): groups → violations → levels. Nothing is ever deleted — groups and
 * violations are retired with `isActive: false`. Levels are replaced as a whole on edit (they're
 * values of the violation; approved records copy what they need).
 */
@Injectable()
export class PenaltyCatalogueRepository {
  constructor(private readonly db: DatabaseService) {}

  findGroupsWithViolations(): Promise<GroupWithViolationsRow[]> {
    return this.db.penaltyGroup.findMany({
      select: GROUP_WITH_VIOLATIONS_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findGroup(id: string): Promise<GroupRow | null> {
    return this.db.penaltyGroup.findUnique({ where: { id }, select: GROUP_SELECT });
  }

  createGroup(data: GroupData): Promise<GroupRow> {
    return this.db.penaltyGroup.create({ data, select: GROUP_SELECT });
  }

  updateGroup(id: string, data: GroupUpdateData): Promise<GroupRow> {
    return this.db.penaltyGroup.update({ where: { id }, data, select: GROUP_SELECT });
  }

  findViolation(id: string): Promise<UsableViolationRow | null> {
    return this.db.violation.findUnique({
      where: { id },
      select: { ...VIOLATION_SELECT, group: { select: { isActive: true } } },
    });
  }

  createViolation(
    groupId: string,
    data: ViolationData,
    levels: readonly LevelData[],
  ): Promise<ViolationRow> {
    return this.db.violation.create({
      data: { ...data, groupId, levels: { create: [...levels] } },
      select: VIOLATION_SELECT,
    });
  }

  /** Updates the fields and, when `levels` is given, replaces the levels — all in one transaction. */
  updateViolation(
    id: string,
    data: ViolationUpdateData,
    levels: readonly LevelData[] | undefined,
  ): Promise<ViolationRow> {
    return this.db.violation.update({
      where: { id },
      data: {
        ...data,
        ...(levels ? { levels: { deleteMany: {}, create: [...levels] } } : {}),
      },
      select: VIOLATION_SELECT,
    });
  }
}

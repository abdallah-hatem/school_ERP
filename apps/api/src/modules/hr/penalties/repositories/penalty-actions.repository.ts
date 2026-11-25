import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import type { Paginated, PenaltyEffect, PenaltySalaryBase } from '@school-erp/shared';
import { BaseRepository } from '../../../../common/repositories/base.repository';
import { DatabaseService } from '../../../../database/database.service';
import type { DbAdapter, DbClient } from '../../../../database/transactions';

export const PENALTY_ACTION_SELECT = {
  id: true,
  code: true,
  nameEn: true,
  nameAr: true,
  effect: true,
  percentBase: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.PenaltyActionSelect;

export type PenaltyActionRow = Prisma.PenaltyActionGetPayload<{ select: typeof PENALTY_ACTION_SELECT }>;

export interface PenaltyActionData {
  code?: string | null;
  nameEn: string;
  nameAr: string;
  effect: PenaltyEffect;
  percentBase: PenaltySalaryBase | null;
  sortOrder?: number;
}
export interface PenaltyActionUpdateData {
  nameEn?: string;
  nameAr?: string;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Where an action is used (owner Q19, 2026-11-26): levels and violations in use now (the violation
 * and its group active), and retired violations that still hold it, counted apart.
 */
export interface ActionUsage {
  levels: number;
  violations: number;
  retiredViolations: number;
}

/** A write refused by the case-insensitive unique name indexes (`penalty_actions_name_*_lower_key`). */
export class PenaltyActionNameTaken extends Error {}

function nameTaken(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

const ORDER = [{ sortOrder: 'asc' }, { nameEn: 'asc' }] satisfies Prisma.PenaltyActionOrderByWithRelationInput[];

/**
 * The school's penalty actions (spec 2026-11-25). Never deleted. Writes run in the caller's
 * transaction (an edit and its history entry commit together). Names are unique in each language,
 * any case, hidden ones included — the database's indexes decide (two people adding the same name
 * at once: one wins), and a refusal comes back as `PenaltyActionNameTaken`.
 */
@Injectable()
export class PenaltyActionsRepository extends BaseRepository<PenaltyActionRow, PenaltyActionData, PenaltyActionUpdateData> {
  constructor(
    databaseService: DatabaseService,
    private readonly txHost: TransactionHost<DbAdapter>,
  ) {
    super(databaseService, 'penaltyAction');
  }

  private get db(): DbClient {
    return this.txHost.tx;
  }

  /** The whole list in its order (the level editor's picker); hidden ones only with `includeHidden`. */
  findAllOrdered(includeHidden: boolean): Promise<PenaltyActionRow[]> {
    return this.db.penaltyAction.findMany({
      where: includeHidden ? {} : { isActive: true },
      orderBy: ORDER,
      select: PENALTY_ACTION_SELECT,
    });
  }

  /** One page (Settings), searched by either name through the shared search. */
  findPage(includeHidden: boolean, page?: number, limit?: number, search?: string): Promise<Paginated<PenaltyActionRow>> {
    return this.findAllWithPagination(page, limit, search || undefined, includeHidden ? {} : { isActive: true }, {
      select: PENALTY_ACTION_SELECT,
      orderBy: ORDER,
    });
  }

  findOne(id: string): Promise<PenaltyActionRow | null> {
    return this.db.penaltyAction.findUnique({ where: { id }, select: PENALTY_ACTION_SELECT });
  }

  findByIds(ids: readonly string[]): Promise<PenaltyActionRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.penaltyAction.findMany({ where: { id: { in: [...ids] } }, select: PENALTY_ACTION_SELECT });
  }

  findByCodes(codes: readonly string[]): Promise<PenaltyActionRow[]> {
    return this.db.penaltyAction.findMany({ where: { code: { in: [...codes] } }, select: PENALTY_ACTION_SELECT });
  }

  /** The highest order in use (a new action goes after it). */
  async maxSortOrder(): Promise<number> {
    const r = await this.db.penaltyAction.aggregate({ _max: { sortOrder: true } });
    return r._max.sortOrder ?? 0;
  }

  async createAction(data: PenaltyActionData): Promise<PenaltyActionRow> {
    try {
      return await this.db.penaltyAction.create({ data, select: PENALTY_ACTION_SELECT });
    } catch (e) {
      if (nameTaken(e)) throw new PenaltyActionNameTaken();
      throw e;
    }
  }

  async updateAction(id: string, data: PenaltyActionUpdateData): Promise<PenaltyActionRow> {
    try {
      return await this.db.penaltyAction.update({ where: { id }, data, select: PENALTY_ACTION_SELECT });
    } catch (e) {
      if (nameTaken(e)) throw new PenaltyActionNameTaken();
      throw e;
    }
  }

  /** Per action: levels and violations in use now, and retired violations holding it (one query for a page). */
  async usage(ids: readonly string[]): Promise<Map<string, ActionUsage>> {
    const out = new Map<string, ActionUsage>(ids.map((id) => [id, { levels: 0, violations: 0, retiredViolations: 0 }]));
    if (ids.length === 0) return out;
    const rows = await this.db.violationLevel.findMany({
      where: { actionId: { in: [...ids] } },
      select: { actionId: true, violationId: true, violation: { select: { isActive: true, group: { select: { isActive: true } } } } },
    });
    const seen = new Set<string>();
    for (const r of rows) {
      const u = out.get(r.actionId)!;
      const active = r.violation.isActive && r.violation.group.isActive;
      if (active) u.levels += 1;
      const key = `${r.actionId}:${r.violationId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (active) u.violations += 1;
      else u.retiredViolations += 1;
    }
    return out;
  }
}

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PAGINATION, type Paginated, type Stage } from '@school-erp/shared';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { DbAdapter, DbClient } from '../../../database/transactions';

const stageSelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  sortOrder: true,
  isActive: true,
  isNoStage: true,
} satisfies Prisma.StageSelect;

/**
 * Stages (school structure). Never deleted — hidden with `isActive: false` (§3). Runs in the
 * caller's transaction when one is open, so a stage edit and its history commit together.
 */
@Injectable()
export class StageRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db(): DbClient {
    return this.txHost.tx;
  }

  /** One page (by order, then English name), searched by either name (any case). */
  async findPage(
    includeHidden: boolean,
    page = 1,
    limit: number = PAGINATION.defaultLimit,
    search?: string,
    ids?: string[],
  ): Promise<Paginated<Stage>> {
    const take = Math.min(Math.max(1, limit), PAGINATION.maxLimit);
    const current = Math.max(1, page);
    const where: Prisma.StageWhereInput = includeHidden ? {} : { isActive: true };
    if (ids) where.id = { in: ids };
    if (search) {
      where.OR = [
        { nameEn: { contains: search, mode: 'insensitive' } },
        { nameAr: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.db.stage.findMany({
        where,
        select: stageSelect,
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
        skip: (current - 1) * take,
        take,
      }),
      this.db.stage.count({ where }),
    ]);
    return { data, total, page: current, limit: take, hasNextPage: current * take < total, hasPreviousPage: current > 1 };
  }

  findMany(includeHidden: boolean): Promise<Stage[]> {
    return this.db.stage.findMany({
      where: includeHidden ? undefined : { isActive: true },
      select: stageSelect,
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
  }

  findById(id: string): Promise<Stage | null> {
    return this.db.stage.findUnique({ where: { id }, select: stageSelect });
  }

  /** The stage marked as the "no stage" entry, if any. */
  findNoStage(): Promise<Stage | null> {
    return this.db.stage.findFirst({ where: { isNoStage: true }, select: stageSelect });
  }

  setNoStage(id: string): Promise<Stage> {
    return this.db.stage.update({ where: { id }, data: { isNoStage: true }, select: stageSelect });
  }

  async nextSortOrder(): Promise<number> {
    const { _max } = await this.db.stage.aggregate({ _max: { sortOrder: true } });
    return (_max.sortOrder ?? -1) + 1;
  }

  create(data: Prisma.StageCreateInput): Promise<Stage> {
    return this.db.stage.create({ data, select: stageSelect });
  }

  update(id: string, data: Prisma.StageUpdateInput): Promise<Stage> {
    return this.db.stage.update({ where: { id }, data, select: stageSelect });
  }
}

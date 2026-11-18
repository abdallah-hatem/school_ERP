import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Stage } from '@school-erp/shared';
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

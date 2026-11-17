import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Stage } from '@school-erp/shared';
import { DatabaseService } from '../../../database/database.service';

const stageSelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.StageSelect;

/** Stages (school structure). Never deleted — hidden with `isActive: false` (§3). */
@Injectable()
export class StageRepository {
  constructor(private readonly db: DatabaseService) {}

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

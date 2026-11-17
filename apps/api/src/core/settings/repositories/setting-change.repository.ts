import { Injectable } from '@nestjs/common';
import { Prisma, SettingScope } from '@prisma/client';
import { PAGINATION, type Paginated } from '@school-erp/shared';
import { DatabaseService } from '../../../database/database.service';

export interface NewSettingChange {
  scope: SettingScope;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  changedById: string | null;
  changedAt: Date;
}

const changeSelect = {
  id: true,
  scope: true,
  key: true,
  oldValue: true,
  newValue: true,
  changedAt: true,
  changedBy: { select: { id: true, name: true } },
} satisfies Prisma.SettingChangeSelect;

export type SettingChangeRow = Prisma.SettingChangeGetPayload<{ select: typeof changeSelect }>;

const json = (v: unknown) =>
  (v === null || v === undefined ? Prisma.JsonNull : v) as Prisma.InputJsonValue;

/** The settings change history (§7). Rows are only ever added. */
@Injectable()
export class SettingChangeRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(change: NewSettingChange): Promise<void> {
    await this.db.settingChange.create({
      data: {
        scope: change.scope,
        key: change.key,
        oldValue: json(change.oldValue),
        newValue: json(change.newValue),
        changedById: change.changedById,
        changedAt: change.changedAt,
      },
    });
  }

  /** Newest first. `limit` is capped at the contract's max. */
  async findPage(page: number, limit: number): Promise<Paginated<SettingChangeRow>> {
    const take = Math.min(Math.max(1, limit), PAGINATION.maxLimit);
    const current = Math.max(1, page);
    const [data, total] = await Promise.all([
      this.db.settingChange.findMany({
        select: changeSelect,
        orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
        skip: (current - 1) * take,
        take,
      }),
      this.db.settingChange.count(),
    ]);
    return {
      data,
      total,
      page: current,
      limit: take,
      hasNextPage: current * take < total,
      hasPreviousPage: current > 1,
    };
  }
}

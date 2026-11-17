import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import { PAGINATION, type AuditChange, type Paginated } from '@school-erp/shared';
import type { DbAdapter } from '../../../database/transactions';

export interface NewAuditEntry {
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  actorId: string | null;
  actorName: string | null;
  changes: AuditChange[];
  meta: { ip: string | null; userAgent: string | null; requestId: string | null };
  at: Date;
}

export interface AuditEntryFilter {
  actorId?: string;
  module?: string;
  action?: string;
  from?: Date;
  to?: Date;
  q?: string;
  entityType?: string;
  entityId?: string;
}

const entrySelect = {
  id: true,
  action: true,
  module: true,
  entityType: true,
  entityId: true,
  entityLabel: true,
  actorId: true,
  actorName: true,
  changes: true,
  meta: true,
  at: true,
} satisfies Prisma.AuditEntrySelect;

export type AuditEntryRow = Prisma.AuditEntryGetPayload<{ select: typeof entrySelect }>;

/** One changed field of a settings-history entry, flattened (one row per change). */
export interface SettingsHistoryRow {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  at: Date;
  ord: number;
  change: AuditChange;
}

const page = (p: number, limit: number) => {
  const take = Math.min(Math.max(1, limit), PAGINATION.maxLimit);
  const current = Math.max(1, p);
  return { take, current, skip: (current - 1) * take };
};

const paginated = <T>(data: T[], total: number, current: number, take: number): Paginated<T> => ({
  data,
  total,
  page: current,
  limit: take,
  hasNextPage: current * take < total,
  hasPreviousPage: current > 1,
});

/**
 * `audit_entries` (core/audit). Only ever INSERTs — the table refuses UPDATE and DELETE (D8).
 * Writes go through the caller's open transaction (`txHost.tx`), so an entry commits or rolls
 * back with the change it describes (D2).
 */
@Injectable()
export class AuditEntryRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  async create(entry: NewAuditEntry): Promise<void> {
    await this.txHost.tx.auditEntry.create({
      data: {
        ...entry,
        changes: entry.changes as unknown as Prisma.InputJsonValue,
        meta: entry.meta,
      },
      select: { id: true },
    });
  }

  /** A user's current name (any status), or null — for an entry recorded on someone's behalf. */
  async findUserName(id: string): Promise<string | null> {
    const row = await this.txHost.tx.user.findUnique({ where: { id }, select: { name: true } });
    return row?.name ?? null;
  }

  /** Newest first (`at`, then insertion order). `limit` capped at the contract max. */
  async findPage(
    filter: AuditEntryFilter,
    p: number,
    limit: number,
  ): Promise<Paginated<AuditEntryRow>> {
    const { take, current, skip } = page(p, limit);
    const where: Prisma.AuditEntryWhereInput = {
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.module ? { module: filter.module } : {}),
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.from || filter.to
        ? {
            at: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
      ...(filter.q ? { entityLabel: { contains: filter.q, mode: 'insensitive' } } : {}),
    };
    const db = this.txHost.tx;
    const [data, total] = await Promise.all([
      db.auditEntry.findMany({
        where,
        select: entrySelect,
        orderBy: [{ at: 'desc' }, { seq: 'desc' }],
        skip,
        take,
      }),
      db.auditEntry.count({ where }),
    ]);
    return paginated(data, total, current, take);
  }

  /**
   * Settings → Change history (D9): the changes of `actions`' entries, one row per changed field,
   * newest entry first, in the order the fields were recorded. Paged by change, not by entry.
   */
  async findChangesPage(
    actions: readonly string[],
    p: number,
    limit: number,
  ): Promise<Paginated<SettingsHistoryRow>> {
    const { take, current, skip } = page(p, limit);
    const inActions = Prisma.join([...actions]);
    const db = this.txHost.tx;
    const [rows, counted] = await Promise.all([
      db.$queryRaw<
        {
          id: string;
          action: string;
          actor_id: string | null;
          actor_name: string | null;
          at: Date;
          ord: bigint;
          change: AuditChange;
        }[]
      >`
        SELECT e."id", e."action", e."actor_id", e."actor_name", e."at", c.ord, c.value AS change
        FROM "audit_entries" e
        CROSS JOIN LATERAL jsonb_array_elements(e."changes") WITH ORDINALITY AS c(value, ord)
        WHERE e."action" IN (${inActions})
        ORDER BY e."at" DESC, e."seq" DESC, c.ord ASC
        LIMIT ${take} OFFSET ${skip}`,
      db.$queryRaw<{ total: number }[]>`
        SELECT COALESCE(SUM(jsonb_array_length("changes")), 0)::int AS total
        FROM "audit_entries" WHERE "action" IN (${inActions})`,
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorId: r.actor_id,
      actorName: r.actor_name,
      at: r.at,
      ord: Number(r.ord),
      change: r.change,
    }));
    return paginated(data, counted[0]?.total ?? 0, current, take);
  }
}

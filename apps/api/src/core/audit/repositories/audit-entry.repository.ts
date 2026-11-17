import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import {
  AUDIT_FAILED_SIGN_IN,
  AUDIT_MONEY_ACTIONS,
  AUDIT_MONEY_FIELDS,
  PAGINATION,
  type AuditActor,
  type AuditChange,
  type AuditSummary,
  type Paginated,
} from '@school-erp/shared';
import type { DbAdapter } from '../../../database/transactions';

export interface NewAuditEntry {
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  /** The Arabic name, when the record has one (else the label reads the same in both languages). */
  entityLabelAr: string | null;
  actorId: string | null;
  actorName: string | null;
  changes: AuditChange[];
  meta: { ip: string | null; userAgent: string | null; requestId: string | null };
  at: Date;
}

export interface AuditEntryFilter {
  actorId?: string;
  module?: string;
  /** Any of these actions. */
  actions?: readonly string[];
  from?: Date;
  to?: Date;
  q?: string;
  entityType?: string;
  entityId?: string;
  /** Only entries that changed this field. */
  field?: string;
}

const entrySelect = {
  id: true,
  action: true,
  module: true,
  entityType: true,
  entityId: true,
  entityLabel: true,
  entityLabelAr: true,
  actorId: true,
  actorName: true,
  changes: true,
  meta: true,
  at: true,
} satisfies Prisma.AuditEntrySelect;

export type AuditEntryRow = Prisma.AuditEntryGetPayload<{ select: typeof entrySelect }>;

/** How many people a picker lists at most (newest first). */
const ACTORS_CAP = 200;

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

function whereOf(filter: AuditEntryFilter): Prisma.AuditEntryWhereInput {
  return {
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.module ? { module: filter.module } : {}),
    ...(filter.actions ? { action: { in: [...filter.actions] } } : {}),
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
    // The record's name in either language.
    ...(filter.q
      ? {
          OR: [
            { entityLabel: { contains: filter.q, mode: 'insensitive' } },
            { entityLabelAr: { contains: filter.q, mode: 'insensitive' } },
          ],
        }
      : {}),
    // jsonb containment: the changes array holds an element with this field.
    ...(filter.field ? { changes: { array_contains: [{ field: filter.field }] } } : {}),
  };
}

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
    const where = whereOf(filter);
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
   * How many entries match `filter` in each period (`[from, to)`), in order — the Activity page's
   * day headers. `filter`'s own `from` / `to` are ignored; each period replaces them.
   */
  async countPerPeriod(filter: AuditEntryFilter, periods: readonly { from: Date; to: Date }[]): Promise<number[]> {
    const db = this.txHost.tx;
    return Promise.all(
      periods.map((p) => db.auditEntry.count({ where: whereOf({ ...filter, from: p.from, to: p.to }) })),
    );
  }

  /**
   * The people in the log (or on one record), each once with the name of their latest entry,
   * most recently active first. People who were never signed in (failed sign-ins) are not people.
   */
  async findActors(filter: { entityType?: string; entityId?: string }): Promise<AuditActor[]> {
    const record =
      filter.entityType && filter.entityId
        ? Prisma.sql`AND "entity_type" = ${filter.entityType} AND "entity_id" = ${filter.entityId}`
        : Prisma.empty;
    const rows = await this.txHost.tx.$queryRaw<{ id: string; name: string | null }[]>`
      SELECT id, name FROM (
        SELECT DISTINCT ON ("actor_id") "actor_id"::text AS id, "actor_name" AS name, "at", "seq"
        FROM "audit_entries"
        WHERE "actor_id" IS NOT NULL ${record}
        ORDER BY "actor_id", "at" DESC, "seq" DESC
      ) latest
      ORDER BY "at" DESC, "seq" DESC
      LIMIT ${ACTORS_CAP}`;
    return rows.map((r) => ({ id: r.id, name: r.name ?? '' }));
  }

  /** The fields one record's entries changed, alphabetically (the History tab's field filter). */
  async findFields(entityType: string, entityId: string): Promise<string[]> {
    const rows = await this.txHost.tx.$queryRaw<{ field: string }[]>`
      SELECT DISTINCT c.value->>'field' AS field
      FROM "audit_entries" e
      CROSS JOIN LATERAL jsonb_array_elements(e."changes") AS c(value)
      WHERE e."entity_type" = ${entityType} AND e."entity_id" = ${entityId}
        AND c.value->>'field' IS NOT NULL
      ORDER BY field`;
    return rows.map((r) => r.field);
  }

  /** Counts for "today at a glance": entries, people, money entries and failed sign-ins in a period. */
  async summary(from: Date, to: Date): Promise<AuditSummary> {
    const moneyActions = Prisma.join([...AUDIT_MONEY_ACTIONS]);
    const moneyFields = Prisma.join([...AUDIT_MONEY_FIELDS]);
    const [row] = await this.txHost.tx.$queryRaw<
      { actions: number; people: number; money: number; failed: number }[]
    >`
      SELECT
        COUNT(*)::int AS actions,
        COUNT(DISTINCT e."actor_id")::int AS people,
        COUNT(*) FILTER (
          WHERE e."action" IN (${moneyActions})
             OR EXISTS (
               SELECT 1 FROM jsonb_array_elements(e."changes") AS c(value)
               WHERE c.value->>'field' IN (${moneyFields})
             )
        )::int AS money,
        COUNT(*) FILTER (WHERE e."action" = ${AUDIT_FAILED_SIGN_IN})::int AS failed
      FROM "audit_entries" e
      WHERE e."at" >= ${from} AND e."at" < ${to}`;
    return {
      actions: row?.actions ?? 0,
      people: row?.people ?? 0,
      money: row?.money ?? 0,
      failedSignIns: row?.failed ?? 0,
    };
  }
}

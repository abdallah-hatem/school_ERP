import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import {
  AUDIT_ACTORS_MAX,
  AUDIT_FAILED_SIGN_IN,
  AUDIT_MONEY_ACTIONS,
  AUDIT_MONEY_FIELDS,
  PAGINATION,
  type AuditActor,
  type AuditChange,
  type AuditSummary,
  type Gender,
  type Paginated,
} from '@school-erp/shared';
import type { DbAdapter } from '../../../database/transactions';
import { searchSql, searchWhere } from '../../../common/repositories/search';

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

/** Some records of one type (`AuditRecordSet` without core's type). */
export interface RecordSet {
  entityType: string;
  ids: readonly string[];
}

export interface AuditEntryFilter {
  actorId?: string;
  module?: string;
  /** Any of these actions. */
  actions?: readonly string[];
  from?: Date;
  to?: Date;
  /** The record's name in either language, or (`qRecords`) a record matched by a field kept elsewhere. */
  q?: string;
  /** With `q`: the records it matches outside the labels (an employee's code — `searchMatches`). */
  qRecords?: readonly RecordSet[];
  /** Only entries about these records (a History: the record and its related ones). */
  records?: readonly RecordSet[];
  /** Only entries that changed this field. */
  field?: string;
  /** Leave out entries about records of these types outside their ids (the viewer's scope, P4). */
  restricted?: readonly { entityType: string; ids: readonly string[] }[];
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
const ACTORS_CAP = AUDIT_ACTORS_MAX;

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

const inRecords = (records: readonly RecordSet[]): Prisma.AuditEntryWhereInput[] =>
  records.map((r) => ({ entityType: r.entityType, entityId: { in: [...r.ids] } }));

function whereOf(filter: AuditEntryFilter): Prisma.AuditEntryWhereInput {
  const and: Prisma.AuditEntryWhereInput[] = [];
  if (filter.records) and.push({ OR: inRecords(filter.records) });
  // The record's name in either language (the shared search), or a record the search matched by
  // its code.
  const named = searchWhere(filter.q);
  if (named) {
    and.push({ OR: [...named.OR, ...inRecords(filter.qRecords ?? [])] });
  }
  for (const r of filter.restricted ?? []) {
    and.push({ NOT: { entityType: r.entityType, entityId: { notIn: [...r.ids] } } });
  }
  return {
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.module ? { module: filter.module } : {}),
    ...(filter.actions ? { action: { in: [...filter.actions] } } : {}),
    ...(filter.from || filter.to
      ? {
          at: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lt: filter.to } : {}),
          },
        }
      : {}),
    // jsonb containment: the changes array holds an element with this field.
    ...(filter.field ? { changes: { array_contains: [{ field: filter.field }] } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

/** `AND (type = t1 AND id IN ids1 OR …)` — the raw-SQL twin of `whereOf`'s `records`. */
function recordsSql(records: readonly RecordSet[] | undefined, alias?: string): Prisma.Sql {
  if (!records) return Prisma.empty;
  const col = (name: string) => Prisma.raw(alias ? `${alias}."${name}"` : `"${name}"`);
  const any = records.map(
    (r) => Prisma.sql`(${col('entity_type')} = ${r.entityType} AND ${col('entity_id')} = ANY(${[...r.ids]}::text[]))`,
  );
  return any.length ? Prisma.sql`AND (${Prisma.join(any, ' OR ')})` : Prisma.sql`AND FALSE`;
}

/**
 * `AND NOT (type = t AND id NOT IN ids)` for each restriction — the raw-SQL twin of `whereOf`'s
 * `restricted` (an empty id list hides every entry of that type).
 */
function restrictionSql(restricted: AuditEntryFilter['restricted'] = [], alias?: string): Prisma.Sql {
  if (!restricted.length) return Prisma.empty;
  const col = (name: string) => Prisma.raw(alias ? `${alias}."${name}"` : `"${name}"`);
  return Prisma.join(
    restricted.map((r) =>
      r.ids.length
        ? Prisma.sql`AND NOT (${col('entity_type')} = ${r.entityType} AND ${col('entity_id')} <> ALL(${[...r.ids]}::text[]))`
        : Prisma.sql`AND ${col('entity_type')} <> ${r.entityType}`,
    ),
    ' ',
  );
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

  /**
   * The employees these users are linked to today (`users.employee_id`), so a timeline can open the
   * actor's profile. Users without a link (or deleted since) are missing from the map.
   */
  async findLinkedEmployees(userIds: readonly string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.txHost.tx.user.findMany({
      where: { id: { in: [...userIds] }, employeeId: { not: null } },
      select: { id: true, employeeId: true },
    });
    return new Map(rows.flatMap((r) => (r.employeeId ? [[r.id, r.employeeId] as const] : [])));
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
  async findActors(
    filter: { records?: readonly RecordSet[]; search?: string; id?: string; limit?: number },
    restricted: AuditEntryFilter['restricted'] = [],
  ): Promise<AuditActor[]> {
    const record = recordsSql(filter.records);
    const scope = restrictionSql(restricted);
    const one = filter.id ? Prisma.sql`AND "actor_id" = ${filter.id}::uuid` : Prisma.empty;
    // The search is on the name the person had most recently (what the picker shows), by the shared
    // rule (a handful of people: the fold runs on the fly, no index needed).
    const named = filter.search ? Prisma.sql`WHERE ${searchSql(Prisma.sql`latest.name`, filter.search)}` : Prisma.empty;
    const limit = Math.min(Math.max(1, filter.limit ?? ACTORS_CAP), ACTORS_CAP);
    // The avatar comes from the account's linked employee (core's users and HR's employees tables:
    // reading is allowed, writing is not); none when the account is unlinked or gone.
    const rows = await this.txHost.tx.$queryRaw<
      { id: string; name: string | null; employee_id: string | null; photo_url: string | null; gender: Gender | null }[]
    >`
      SELECT latest.id, latest.name, e."id"::text AS employee_id, e."photo_url", e."gender"::text AS gender FROM (
        SELECT DISTINCT ON ("actor_id") "actor_id" AS actor, "actor_id"::text AS id, "actor_name" AS name, "at", "seq"
        FROM "audit_entries"
        WHERE "actor_id" IS NOT NULL ${record} ${scope} ${one}
        ORDER BY "actor_id", "at" DESC, "seq" DESC
      ) latest
      LEFT JOIN "users" u ON u."id" = latest.actor
      LEFT JOIN "employees" e ON e."id" = u."employee_id"
      ${named}
      ORDER BY latest."at" DESC, latest."seq" DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? '',
      employee: r.employee_id && r.gender ? { photoUrl: r.photo_url, gender: r.gender } : null,
    }));
  }

  /**
   * The fields the entries about these records changed, alphabetically (the History tab's field
   * filter: the record and its related ones).
   */
  async findFields(records: readonly RecordSet[]): Promise<string[]> {
    const rows = await this.txHost.tx.$queryRaw<{ field: string }[]>`
      SELECT DISTINCT c.value->>'field' AS field
      FROM "audit_entries" e
      CROSS JOIN LATERAL jsonb_array_elements(e."changes") AS c(value)
      WHERE c.value->>'field' IS NOT NULL ${recordsSql(records, 'e')}
      ORDER BY field`;
    return rows.map((r) => r.field);
  }

  /** Counts for "today at a glance": entries, people, money entries and failed sign-ins in a period. */
  /** `restricted`: leave out entries about records outside the viewer's scope (P4), as `findPage` does. */
  async summary(
    from: Date,
    to: Date,
    restricted: AuditEntryFilter['restricted'] = [],
  ): Promise<AuditSummary> {
    const scope = restrictionSql(restricted, 'e');
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
      WHERE e."at" >= ${from} AND e."at" < ${to} ${scope}`;
    return {
      actions: row?.actions ?? 0,
      people: row?.people ?? 0,
      money: row?.money ?? 0,
      failedSignIns: row?.failed ?? 0,
    };
  }
}

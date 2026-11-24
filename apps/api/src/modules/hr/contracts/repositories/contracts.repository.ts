import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import {
  type ContractDecisionFilter,
  type ContractTotals,
  type IsoDate,
} from '@school-erp/shared';
import { codeContains, searchColumnsSql } from '../../../../common/repositories/search';
import { fromIsoDate } from '../../../../common/utils/dates.util';
import type { DbAdapter, DbClient } from '../../../../database/transactions';
import type { EmployeeScope } from '../../access/employee-scope.pure';

const USER_REF = { select: { id: true, name: true } } as const;
const NAMED = { select: { id: true, nameEn: true, nameAr: true } } as const;

export const CONTRACT_SELECT = {
  id: true,
  employeeId: true,
  startsOn: true,
  endsOn: true,
  status: true,
  nonRenewalBy: true,
  noticeReceivedOn: true,
  noticeTiming: true,
  noticeFileUrl: true,
  note: true,
  earlyTerminationStatus: true,
  earlyTerminationRequestedOn: true,
  earlyTerminationTiming: true,
  earlyTerminationNote: true,
  earlyTerminationFileUrl: true,
  earlyTerminationDecidedAt: true,
  earlyTerminationRejectReason: true,
  endedOn: true,
  endReason: true,
  endNote: true,
  endFileUrl: true,
  decidedAt: true,
  nextContractId: true,
  createdAt: true,
  employee: {
    select: {
      id: true,
      code: true,
      nameEn: true,
      nameAr: true,
      photoUrl: true,
      gender: true,
      status: true,
      // For the scope checks (team scope by manager, stage scope by every stage); not in the response.
      managerId: true,
      contractStart: true,
      contractEnd: true,
      stage: { select: { id: true, nameEn: true, nameAr: true, isNoStage: true } },
      jobTitle: NAMED,
      otherStages: { select: { stageId: true } },
    },
  },
  decidedBy: USER_REF,
  earlyTerminationDecidedBy: USER_REF,
  nextContract: { select: { id: true, startsOn: true, endsOn: true } },
} satisfies Prisma.EmployeeContractSelect;

export type ContractRow = Prisma.EmployeeContractGetPayload<{ select: typeof CONTRACT_SELECT }>;

export type ContractUpdateData = Prisma.EmployeeContractUncheckedUpdateInput;

/** What the renewal list is narrowed to. */
export interface ContractListFilter {
  /** The contract year's first and last day: contracts whose signed end falls inside. */
  from: IsoDate;
  to: IsoDate;
  /** The school's today: "ended", "to deactivate" and the order depend on it. */
  today: IsoDate;
  decision?: ContractDecisionFilter;
  stageId?: string;
  search?: string;
}

/** The scope as SQL on `employees e` (same rule as `employeeWhere`). */
function scopeSql(scope: EmployeeScope): Prisma.Sql {
  switch (scope.kind) {
    case 'all':
      return Prisma.sql`TRUE`;
    case 'none':
      return Prisma.sql`FALSE`;
    case 'stage': {
      const ids = Prisma.join(scope.stageIds.map((id) => Prisma.sql`${id}::uuid`));
      return Prisma.sql`(e."stage_id" IN (${ids}) OR EXISTS (SELECT 1 FROM "employee_stages" s WHERE s."employee_id" = e."id" AND s."stage_id" IN (${ids})))`;
    }
    case 'team':
      return Prisma.sql`e."manager_id" = ${scope.managerId}::uuid`;
    case 'self':
      return Prisma.sql`e."id" = ${scope.employeeId}::uuid`;
  }
}

/** Each decision as SQL on `employee_contracts c` / `employees e` (same rule as `contractDecision`). */
function decisionSql(today: Date): Record<string, Prisma.Sql> {
  const requested = Prisma.sql`c."early_termination_status" IS NOT DISTINCT FROM 'REQUESTED'`;
  const active = Prisma.sql`c."status" = 'ACTIVE'`;
  return {
    ENDED_NO_DECISION: Prisma.sql`(${active} AND NOT ${requested} AND c."ends_on" < ${today})`,
    UNDECIDED: Prisma.sql`(${active} AND NOT ${requested} AND c."ends_on" >= ${today})`,
    EARLY_REQUESTED: Prisma.sql`(${active} AND ${requested})`,
    RENEWED: Prisma.sql`c."status" = 'RENEWED'`,
    NOTICE: Prisma.sql`(c."status" = 'NOT_RENEWED' AND c."non_renewal_by" = 'EMPLOYEE')`,
    NOT_RENEWED_SCHOOL: Prisma.sql`(c."status" = 'NOT_RENEWED' AND c."non_renewal_by" IS DISTINCT FROM 'EMPLOYEE')`,
    ENDED_EARLY: Prisma.sql`c."status" = 'ENDED_EARLY'`,
    OPEN: Prisma.sql`(${active} AND NOT ${requested})`,
    DECIDED: Prisma.sql`NOT (${active} AND NOT ${requested})`,
    TO_DEACTIVATE: Prisma.sql`(c."status" IN ('NOT_RENEWED', 'ENDED_EARLY') AND COALESCE(c."ended_on", c."ends_on") < ${today} AND e."status" = 'ACTIVE')`,
  };
}

/**
 * Employee contracts (§3 → Contracts). Never deleted. Every write runs in the caller's transaction
 * (`txHost.tx`) after `lockForUpdate`, so two decisions on one contract can't both pass (edge case 4).
 */
@Injectable()
export class ContractsRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db(): DbClient {
    return this.txHost.tx;
  }

  /**
   * One contract year's renewal list (spec → Screens): the page, ordered "needs action first" —
   * ended with no decision, to deactivate, early termination waiting, not decided, notices, not
   * renewed, ended early, renewed — then by employee code. An inactive employee's undecided contract
   * is left out (nothing to decide). Raw SQL for the order; the rows are read back with Prisma.
   */
  async listPage(
    filter: ContractListFilter,
    scope: EmployeeScope,
    page: number,
    limit: number,
  ): Promise<{ rows: ContractRow[]; total: number }> {
    const today = fromIsoDate(filter.today);
    const d = decisionSql(today);
    const conditions: Prisma.Sql[] = [
      Prisma.sql`c."ends_on" BETWEEN ${fromIsoDate(filter.from)} AND ${fromIsoDate(filter.to)}`,
      Prisma.sql`(e."status" = 'ACTIVE' OR c."status" <> 'ACTIVE')`,
      scopeSql(scope),
      searchColumnsSql('e', filter.search),
    ];
    if (filter.stageId) {
      conditions.push(
        Prisma.sql`(e."stage_id" = ${filter.stageId}::uuid OR EXISTS (SELECT 1 FROM "employee_stages" s WHERE s."employee_id" = e."id" AND s."stage_id" = ${filter.stageId}::uuid))`,
      );
    }
    if (filter.decision) conditions.push(d[filter.decision]);
    const where = Prisma.join(conditions, ' AND ');
    const rank = Prisma.sql`CASE
      WHEN ${d.ENDED_NO_DECISION} THEN 1
      WHEN ${d.TO_DEACTIVATE} THEN 2
      WHEN ${d.EARLY_REQUESTED} THEN 3
      WHEN ${d.UNDECIDED} THEN 4
      WHEN ${d.NOTICE} THEN 5
      WHEN ${d.NOT_RENEWED_SCHOOL} THEN 6
      WHEN ${d.ENDED_EARLY} THEN 7
      ELSE 8 END`;
    const [ids, [{ count }]] = await Promise.all([
      this.db.$queryRaw<{ id: string }[]>`
        SELECT c."id" FROM "employee_contracts" c JOIN "employees" e ON e."id" = c."employee_id"
        WHERE ${where}
        ORDER BY ${rank}, e."code", c."ends_on"
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      this.db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "employee_contracts" c JOIN "employees" e ON e."id" = c."employee_id"
        WHERE ${where}`,
    ]);
    const rows = await this.findMany(ids.map((r) => r.id));
    return { rows, total: Number(count) };
  }

  /** The year's five tiles over the viewer's scope (not the search or filters). */
  async totals(from: IsoDate, to: IsoDate, today: IsoDate, scope: EmployeeScope): Promise<ContractTotals> {
    const t = fromIsoDate(today);
    const d = decisionSql(t);
    const year = Prisma.sql`c."ends_on" BETWEEN ${fromIsoDate(from)} AND ${fromIsoDate(to)}`;
    const visible = Prisma.sql`(e."status" = 'ACTIVE' OR c."status" <> 'ACTIVE') AND ${scopeSql(scope)}`;
    const [row] = await this.db.$queryRaw<Record<string, bigint>[]>`
      SELECT
        COUNT(*) FILTER (WHERE ${year})::bigint AS ending,
        COUNT(*) FILTER (WHERE e."status" = 'ACTIVE' AND c."starts_on" <= ${t} AND COALESCE(c."ended_on", c."ends_on") >= ${t})::bigint AS active_contracts,
        COUNT(*) FILTER (WHERE ${year} AND ${d.DECIDED})::bigint AS decided,
        COUNT(*) FILTER (WHERE ${year} AND ${d.RENEWED})::bigint AS renewing,
        COUNT(*) FILTER (WHERE ${year} AND c."status" = 'NOT_RENEWED')::bigint AS not_renewing,
        COUNT(*) FILTER (WHERE ${year} AND ${d.OPEN})::bigint AS open,
        COUNT(*) FILTER (WHERE ${year} AND ${d.ENDED_NO_DECISION})::bigint AS ended_no_decision,
        COUNT(*) FILTER (WHERE ${year} AND ${d.NOTICE})::bigint AS notices,
        COUNT(*) FILTER (WHERE ${year} AND ${d.NOTICE} AND c."notice_timing" = 'EARLY')::bigint AS notices_early,
        COUNT(*) FILTER (WHERE ${year} AND ${d.NOTICE} AND c."notice_timing" = 'LATE')::bigint AS notices_late,
        COUNT(*) FILTER (WHERE ${year} AND ${d.TO_DEACTIVATE})::bigint AS to_deactivate
      FROM "employee_contracts" c JOIN "employees" e ON e."id" = c."employee_id"
      WHERE ${visible}`;
    const n = (k: string) => Number(row?.[k] ?? 0);
    return {
      ending: n('ending'),
      activeContracts: n('active_contracts'),
      decided: n('decided'),
      renewing: n('renewing'),
      notRenewing: n('not_renewing'),
      open: n('open'),
      endedNoDecision: n('ended_no_decision'),
      notices: n('notices'),
      noticesEarly: n('notices_early'),
      noticesLate: n('notices_late'),
      toDeactivate: n('to_deactivate'),
    };
  }

  /** The rows of `ids`, in that order (unknown ids left out). */
  async findMany(ids: readonly string[]): Promise<ContractRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.employeeContract.findMany({ where: { id: { in: [...ids] } }, select: CONTRACT_SELECT });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is ContractRow => !!r);
  }

  findOne(id: string): Promise<ContractRow | null> {
    return this.db.employeeContract.findUnique({ where: { id }, select: CONTRACT_SELECT });
  }

  /** One employee's contracts, newest first, a page. */
  async listOfEmployee(
    employeeId: string,
    page: number,
    limit: number,
  ): Promise<{ rows: ContractRow[]; total: number }> {
    const where = { employeeId };
    const [rows, total] = await Promise.all([
      this.db.employeeContract.findMany({
        where,
        select: CONTRACT_SELECT,
        orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.employeeContract.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * Locks the contracts' rows for the rest of the transaction (`FOR NO KEY UPDATE`, in id order so
   * two bulk renewals take them in one order): a second decision on the same contract waits, then
   * reads the first one's result (edge case 4).
   */
  async lockForUpdate(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const sorted = [...new Set(ids)].sort();
    await this.db.$queryRaw`
      SELECT "id" FROM "employee_contracts"
      WHERE "id" IN (${Prisma.join(sorted.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY "id" FOR NO KEY UPDATE`;
  }

  async update(id: string, data: ContractUpdateData): Promise<ContractRow> {
    return this.db.employeeContract.update({ where: { id }, data, select: CONTRACT_SELECT });
  }

  async create(data: Prisma.EmployeeContractUncheckedCreateInput): Promise<ContractRow> {
    return this.db.employeeContract.create({ data, select: CONTRACT_SELECT });
  }

  /** The employee's current contract dates (they mirror the active contract — §3). */
  async setEmployeeContractDates(employeeId: string, start: IsoDate, end: IsoDate): Promise<void> {
    await this.db.employee.update({
      where: { id: employeeId },
      data: { contractStart: fromIsoDate(start), contractEnd: fromIsoDate(end) },
    });
  }

  /** The contract a stored document belongs to (files follow their record), by its link. */
  findByDocument(url: string): Promise<ContractRow | null> {
    return this.db.employeeContract.findFirst({
      where: { OR: [{ noticeFileUrl: url }, { earlyTerminationFileUrl: url }, { endFileUrl: url }] },
      select: CONTRACT_SELECT,
    });
  }

  /** The ids of the contracts of the employees `employeeWhere` covers (the Activity log). */
  async idsWhereEmployee(where: Prisma.EmployeeWhereInput): Promise<string[]> {
    const rows = await this.db.employeeContract.findMany({ where: { employee: where }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async idsOfEmployee(employeeId: string): Promise<string[]> {
    const rows = await this.db.employeeContract.findMany({ where: { employeeId }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /** The contracts of the employees whose code contains `q` (Activity's search by code). */
  async idsWithEmployeeCode(q: string): Promise<string[]> {
    const rows = await this.db.employeeContract.findMany({
      where: { employee: { code: codeContains(q) } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

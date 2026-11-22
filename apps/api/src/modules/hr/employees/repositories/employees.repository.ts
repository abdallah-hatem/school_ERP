import { HttpStatus, Injectable } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { ErrorCode, formatEmployeeCode, Paginated } from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { BaseRepository } from '../../../../common/repositories/base.repository';
import { TransactionHost } from '@nestjs-cls/transactional';
import { DatabaseService } from '../../../../database/database.service';
import type { DbAdapter, DbClient } from '../../../../database/transactions';
import { codeContains } from '../../../../common/repositories/search';

/** Counter row the employee codes come from (`Counter` table, never decremented). */
export const EMPLOYEE_CODE_COUNTER = 'employee_code';

const REF = { select: { id: true, nameEn: true, nameAr: true } } as const;

/** "Also teaches in" (§3, owner 2026-11-21): the other stages, in stage order. */
const OTHER_STAGES = {
  select: { stage: REF },
  orderBy: [{ stage: { sortOrder: 'asc' } }, { stage: { nameEn: 'asc' } }],
} as const satisfies Prisma.Employee$otherStagesArgs;

export const EMPLOYEE_SUMMARY_SELECT = {
  id: true,
  code: true,
  nameEn: true,
  nameAr: true,
  department: REF,
  stage: REF,
  otherStages: OTHER_STAGES,
  jobTitle: REF,
  workSystem: true,
  basicSalary: true,
  status: true,
  photoUrl: true,
  gender: true,
  // For the scope and salary checks (R5, R7); not part of the response.
  managerId: true,
} satisfies Prisma.EmployeeSelect;

/** The employee fields a payroll line snapshots at calculation (§6). */
export const PAYROLL_SNAPSHOT_SELECT = {
  id: true,
  code: true,
  nameEn: true,
  nameAr: true,
  nationalId: true,
  departmentId: true,
  department: { select: { nameEn: true, nameAr: true } },
  basicSalary: true,
  workSystem: true,
  insuranceStatus: true,
  insuredSalary: true,
} satisfies Prisma.EmployeeSelect;

export type PayrollSnapshotRow = Prisma.EmployeeGetPayload<{
  select: typeof PAYROLL_SNAPSHOT_SELECT;
}>;

export const EMPLOYEE_DETAIL_SELECT = {
  id: true,
  code: true,
  nameEn: true,
  nameAr: true,
  nationalId: true,
  gender: true,
  dateOfBirth: true,
  phone: true,
  email: true,
  address: true,
  hireDate: true,
  stage: REF,
  otherStages: OTHER_STAGES,
  department: REF,
  jobTitle: REF,
  manager: {
    select: {
      id: true,
      code: true,
      nameEn: true,
      nameAr: true,
      photoUrl: true,
      gender: true,
      jobTitle: { select: { managesPeople: true } },
    },
  },
  grade: true,
  workSystem: true,
  basicSalary: true,
  fingerprintId: true,
  contractStart: true,
  contractEnd: true,
  probationEnd: true,
  usesBus: true,
  photoUrl: true,
  insuranceStatus: true,
  insuranceNumber: true,
  insuranceRegistrationDate: true,
  insuredSalary: true,
  bankName: true,
  bankAccountNumber: true,
  iban: true,
  emergencyContactName: true,
  emergencyContactRelationship: true,
  emergencyContactPhone: true,
  highestDegree: true,
  major: true,
  university: true,
  graduationYear: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployeeSelect;

export type EmployeeSummaryRow = Prisma.EmployeeGetPayload<{
  select: typeof EMPLOYEE_SUMMARY_SELECT;
}>;
export type EmployeeDetailRow = Prisma.EmployeeGetPayload<{
  select: typeof EMPLOYEE_DETAIL_SELECT;
}>;

/** Everything a create writes except the code, which the repository assigns. */
export type EmployeeCreateData = Omit<
  Prisma.EmployeeUncheckedCreateInput,
  'code' | 'id' | 'status'
>;
export type EmployeeUpdateData = Prisma.EmployeeUncheckedUpdateInput;

export interface EmployeeListFilter {
  departmentId?: string;
  stageId?: string;
  status?: EmployeeStatus;
  workSystem?: Prisma.EmployeeWhereInput['workSystem'];
  /** Only employees whose job title manages people (the direct-manager picker, §3). */
  managesPeople?: boolean;
  /** Leave this employee out. */
  excludeId?: string;
}

/** A scope's filter on `employees` (R5) — `{}` for every employee. */
export type EmployeeScopeWhere = Prisma.EmployeeWhereInput;

/** What a scope check reads about an employee (`inScope`). */
export interface EmployeeScopeFields {
  id: string;
  stageId: string;
  managerId: string | null;
  /** "Also teaches in" — a stage head of one of them covers the employee too (owner 2026-11-21). */
  otherStageIds: string[];
}

const SCOPE_SELECT = {
  id: true,
  stageId: true,
  managerId: true,
  otherStages: { select: { stageId: true } },
} as const satisfies Prisma.EmployeeSelect;

const toScopeFields = (
  row: Prisma.EmployeeGetPayload<{ select: typeof SCOPE_SELECT }>,
): EmployeeScopeFields => ({
  id: row.id,
  stageId: row.stageId,
  managerId: row.managerId,
  otherStageIds: row.otherStages.map((s) => s.stageId),
});

/** An employee row's stages: main first, then the others (the stages a penalty may be recorded in). */
export const stageIdsOf = (row: Pick<EmployeeScopeFields, 'stageId' | 'otherStageIds'>): string[] => [
  row.stageId,
  ...row.otherStageIds,
];

/** A unique-constraint race the service's pre-check missed → the same 409 the pre-check gives. */
function rethrowUnique(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = JSON.stringify(e.meta?.target ?? '');
    if (/national/i.test(target)) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_NATIONAL_ID);
    }
    if (/fingerprint/i.test(target)) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_FINGERPRINT_ID);
    }
    if (/insurance/i.test(target)) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_INSURANCE_NUMBER);
    }
  }
  throw e;
}

/** Employees (§3). Every query runs through the request's transaction when one is open. */
@Injectable()
export class EmployeesRepository extends BaseRepository<
  EmployeeSummaryRow,
  EmployeeCreateData,
  EmployeeUpdateData
> {
  constructor(
    databaseService: DatabaseService,
    private readonly txHost: TransactionHost<DbAdapter>,
  ) {
    super(databaseService, 'employee');
  }

  /**
   * The open transaction (an audited write's), or the plain client: an employee change and its
   * audit entry commit together, and reads inside the write see its own changes.
   */
  private get db(): DbClient {
    return this.txHost.tx;
  }

  list(
    page: number | undefined,
    limit: number | undefined,
    search: string | undefined,
    filter: EmployeeListFilter,
    scope: EmployeeScopeWhere = {},
  ): Promise<Paginated<EmployeeSummaryRow>> {
    const and: Prisma.EmployeeWhereInput[] = [scope];
    const where: Prisma.EmployeeWhereInput = { AND: and };
    if (filter.departmentId) where.departmentId = filter.departmentId;
    // §3 (owner 2026-11-21): found under every stage they belong to — main or "also teaches in".
    if (filter.stageId) {
      and.push({
        OR: [{ stageId: filter.stageId }, { otherStages: { some: { stageId: filter.stageId } } }],
      });
    }
    if (filter.status) where.status = filter.status;
    if (filter.workSystem) where.workSystem = filter.workSystem;
    if (filter.managesPeople !== undefined) {
      where.jobTitle = { managesPeople: filter.managesPeople };
    }
    if (filter.excludeId) where.id = { not: filter.excludeId };
    return this.findAllWithPagination(
      page,
      limit,
      search || undefined,
      where,
      { select: EMPLOYEE_SUMMARY_SELECT, orderBy: [{ createdAt: 'asc' }, { code: 'asc' }] },
    );
  }

  /** The employee, or null when unknown or outside `scope` (the caller answers 404 either way). */
  findDetail(id: string, scope: EmployeeScopeWhere = {}): Promise<EmployeeDetailRow | null> {
    return this.db.employee.findFirst({
      where: { AND: [{ id }, scope] },
      select: EMPLOYEE_DETAIL_SELECT,
    });
  }

  /** What a scope check needs about one employee, or null when unknown. */
  async findScopeFields(id: string): Promise<EmployeeScopeFields | null> {
    const row = await this.db.employee.findUnique({ where: { id }, select: SCOPE_SELECT });
    return row && toScopeFields(row);
  }

  /** The same, for several employees (unknown ids are absent). */
  async findScopeFieldsMany(ids: readonly string[]): Promise<EmployeeScopeFields[]> {
    if (!ids.length) return [];
    const rows = await this.db.employee.findMany({
      where: { id: { in: [...ids] } },
      select: SCOPE_SELECT,
    });
    return rows.map(toScopeFields);
  }

  /** Which of `ids` are existing stages, with whether each is shown (the "also teaches in" check). */
  findStages(ids: readonly string[]): Promise<{ id: string; isActive: boolean }[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.db.stage.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, isActive: true },
    });
  }

  /**
   * Replaces the employee's other stages (HR's `employee_stages`), in the write's transaction.
   * The main stage is never among them (the service checks).
   */
  async setOtherStages(employeeId: string, stageIds: readonly string[]): Promise<void> {
    await this.db.employeeStage.deleteMany({
      where: { employeeId, stageId: { notIn: [...stageIds] } },
    });
    if (stageIds.length) {
      await this.db.employeeStage.createMany({
        data: stageIds.map((stageId) => ({ employeeId, stageId })),
        skipDuplicates: true,
      });
    }
  }

  /** The record again after a write of its other stages. */
  findDetailById(id: string): Promise<EmployeeDetailRow | null> {
    return this.db.employee.findUnique({ where: { id }, select: EMPLOYEE_DETAIL_SELECT });
  }

  /** The ids of the employees `scope` covers (any status). */
  async findIdsInScope(scope: EmployeeScopeWhere): Promise<string[]> {
    const rows = await this.db.employee.findMany({ where: scope, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /** The ids of the employees (any status) whose code contains `q`, any case (Activity's search). */
  async findIdsByCode(q: string): Promise<string[]> {
    const rows = await this.db.employee.findMany({
      where: { code: codeContains(q) },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Every active employee as a compact reference, by code (lateness and payroll lists). */
  findActiveRefs(): Promise<{ id: string; code: string; nameEn: string; nameAr: string }[]> {
    return this.db.employee.findMany({
      where: { status: EmployeeStatus.ACTIVE },
      select: { id: true, code: true, nameEn: true, nameAr: true },
      orderBy: { code: 'asc' },
    });
  }

  /** Every active employee (in `scope`) with their department, ordered by code. */
  findActiveWithDepartments(scope: EmployeeScopeWhere = {}): Promise<
    {
      id: string;
      code: string;
      nameEn: string;
      nameAr: string;
      department: { id: string; nameEn: string; nameAr: string };
    }[]
  > {
    return this.db.employee.findMany({
      where: { AND: [{ status: EmployeeStatus.ACTIVE }, scope] },
      select: {
        id: true,
        code: true,
        nameEn: true,
        nameAr: true,
        department: { select: { id: true, nameEn: true, nameAr: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  /** Every active employee with the fields a payroll line snapshots (§6), by code. */
  findActiveForPayroll(): Promise<PayrollSnapshotRow[]> {
    return this.db.employee.findMany({
      where: { status: EmployeeStatus.ACTIVE },
      select: PAYROLL_SNAPSHOT_SELECT,
      orderBy: { code: 'asc' },
    });
  }

  /** The bank details on file for `ids` (bank sheet, §6). */
  findBankDetails(
    ids: readonly string[],
  ): Promise<{ id: string; bankName: string | null; bankAccountNumber: string | null; iban: string | null }[]> {
    return this.db.employee.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, bankName: true, bankAccountNumber: true, iban: true },
    });
  }

  /** Active employees per stage, with the stage's names, in stage order (dashboard). */
  async countActiveByStage(scope: EmployeeScopeWhere = {}): Promise<
    { stage: { id: string; nameEn: string; nameAr: string }; count: number }[]
  > {
    const groups = await this.db.employee.groupBy({
      by: ['stageId'],
      where: { AND: [{ status: EmployeeStatus.ACTIVE }, scope] },
      _count: { _all: true },
    });
    if (!groups.length) return [];
    const stages = await this.db.stage.findMany({
      where: { id: { in: groups.map((g) => g.stageId) } },
      select: { id: true, nameEn: true, nameAr: true },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
    const countOf = new Map(groups.map((g) => [g.stageId, g._count._all]));
    return stages.map((stage) => ({ stage, count: countOf.get(stage.id) ?? 0 }));
  }

  /** A would-be direct manager: their status and whether their job title manages people (§3). */
  findManagerState(
    id: string,
  ): Promise<{ id: string; status: EmployeeStatus; jobTitle: { managesPeople: boolean } } | null> {
    return this.db.employee.findUnique({
      where: { id },
      select: { id: true, status: true, jobTitle: { select: { managesPeople: true } } },
    });
  }

  /** Id and status of each existing employee among `ids` (missing ids are simply absent). */
  findStates(ids: string[]): Promise<{ id: string; status: EmployeeStatus }[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.db.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
  }

  /** Read of core's stages table (allowed: read anything, write only your own). */
  findStage(id: string): Promise<{ id: string; isActive: boolean } | null> {
    return this.db.stage.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
  }

  async findIdByNationalId(nationalId: string): Promise<string | null> {
    const row = await this.db.employee.findUnique({
      where: { nationalId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findIdByFingerprintId(fingerprintId: string): Promise<string | null> {
    const row = await this.db.employee.findUnique({
      where: { fingerprintId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findIdByInsuranceNumber(insuranceNumber: string): Promise<string | null> {
    const row = await this.db.employee.findUnique({
      where: { insuranceNumber },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * The ids above `startId` in the manager chain, `startId` included (one recursive query).
   * UNION (not UNION ALL) stops on an existing cycle instead of looping forever.
   */
  async managerChainIds(startId: string): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH RECURSIVE chain(id, manager_id) AS (
        SELECT id, manager_id FROM employees WHERE id = ${startId}::uuid
        UNION
        SELECT e.id, e.manager_id FROM employees e JOIN chain c ON e.id = c.manager_id
      )
      SELECT id::text AS id FROM chain
    `);
    return rows.map((r) => r.id);
  }

  /**
   * Creates the employee with the next `EMP-nnnn` code. The counter is bumped with one atomic
   * upsert inside the same transaction, so concurrent creates serialise on the counter row and
   * never share a code; a rolled-back create never hands its number to anyone.
   */
  async createWithCode(data: EmployeeCreateData): Promise<EmployeeDetailRow> {
    try {
      // Joins the request's transaction when one is open (the audit entry commits with it).
      return await this.txHost.withTransaction(async () => {
        const tx = this.txHost.tx;
        const [counter] = await tx.$queryRaw<{ value: number }[]>(Prisma.sql`
          INSERT INTO counters (name, value, updated_at)
          VALUES (${EMPLOYEE_CODE_COUNTER}, 1, now())
          ON CONFLICT (name) DO UPDATE SET value = counters.value + 1, updated_at = now()
          RETURNING value
        `);
        if (!counter) throw new Error('employee code counter returned no row');
        return tx.employee.create({
          data: { ...data, code: formatEmployeeCode(Number(counter.value)) },
          select: EMPLOYEE_DETAIL_SELECT,
        });
      });
    } catch (e) {
      rethrowUnique(e);
    }
  }

  async updateEmployee(id: string, data: EmployeeUpdateData): Promise<EmployeeDetailRow> {
    try {
      return await this.db.employee.update({
        where: { id },
        data,
        select: EMPLOYEE_DETAIL_SELECT,
      });
    } catch (e) {
      rethrowUnique(e);
    }
  }
}

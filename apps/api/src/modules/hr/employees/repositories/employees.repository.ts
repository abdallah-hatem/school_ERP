import { HttpStatus, Injectable } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { ErrorCode, formatEmployeeCode, Paginated } from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { BaseRepository } from '../../../../common/repositories/base.repository';
import { DatabaseService } from '../../../../database/database.service';

/** Counter row the employee codes come from (`Counter` table, never decremented). */
export const EMPLOYEE_CODE_COUNTER = 'employee_code';

const REF = { select: { id: true, nameEn: true, nameAr: true } } as const;

export const EMPLOYEE_SUMMARY_SELECT = {
  id: true,
  code: true,
  nameEn: true,
  nameAr: true,
  department: REF,
  stage: REF,
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
}

const SCOPE_SELECT = { id: true, stageId: true, managerId: true } as const;

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

@Injectable()
export class EmployeesRepository extends BaseRepository<
  EmployeeSummaryRow,
  EmployeeCreateData,
  EmployeeUpdateData
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'employee');
  }

  list(
    page: number | undefined,
    limit: number | undefined,
    search: string | undefined,
    filter: EmployeeListFilter,
    scope: EmployeeScopeWhere = {},
  ): Promise<Paginated<EmployeeSummaryRow>> {
    const where: Prisma.EmployeeWhereInput = { AND: [scope] };
    if (filter.departmentId) where.departmentId = filter.departmentId;
    if (filter.stageId) where.stageId = filter.stageId;
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
      ['code', 'nameEn', 'nameAr'],
      where,
      { select: EMPLOYEE_SUMMARY_SELECT, orderBy: [{ createdAt: 'asc' }, { code: 'asc' }] },
    );
  }

  /** The employee, or null when unknown or outside `scope` (the caller answers 404 either way). */
  findDetail(id: string, scope: EmployeeScopeWhere = {}): Promise<EmployeeDetailRow | null> {
    return this.databaseService.employee.findFirst({
      where: { AND: [{ id }, scope] },
      select: EMPLOYEE_DETAIL_SELECT,
    });
  }

  /** What a scope check needs about one employee, or null when unknown. */
  findScopeFields(id: string): Promise<EmployeeScopeFields | null> {
    return this.databaseService.employee.findUnique({ where: { id }, select: SCOPE_SELECT });
  }

  /** The same, for several employees (unknown ids are absent). */
  findScopeFieldsMany(ids: readonly string[]): Promise<EmployeeScopeFields[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.databaseService.employee.findMany({
      where: { id: { in: [...ids] } },
      select: SCOPE_SELECT,
    });
  }

  /** The ids of the employees `scope` covers (any status). */
  async findIdsInScope(scope: EmployeeScopeWhere): Promise<string[]> {
    const rows = await this.databaseService.employee.findMany({ where: scope, select: { id: true } });
    return rows.map((r) => r.id);
  }

  findState(id: string): Promise<{ id: string; status: EmployeeStatus } | null> {
    return this.databaseService.employee.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
  }

  /** Every active employee as a compact reference, by code (lateness and payroll lists). */
  findActiveRefs(): Promise<{ id: string; code: string; nameEn: string; nameAr: string }[]> {
    return this.databaseService.employee.findMany({
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
    return this.databaseService.employee.findMany({
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
    return this.databaseService.employee.findMany({
      where: { status: EmployeeStatus.ACTIVE },
      select: PAYROLL_SNAPSHOT_SELECT,
      orderBy: { code: 'asc' },
    });
  }

  /** The bank details on file for `ids` (bank sheet, §6). */
  findBankDetails(
    ids: readonly string[],
  ): Promise<{ id: string; bankName: string | null; bankAccountNumber: string | null; iban: string | null }[]> {
    return this.databaseService.employee.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, bankName: true, bankAccountNumber: true, iban: true },
    });
  }

  /** Active employees per stage, with the stage's names, in stage order (dashboard). */
  async countActiveByStage(scope: EmployeeScopeWhere = {}): Promise<
    { stage: { id: string; nameEn: string; nameAr: string }; count: number }[]
  > {
    const groups = await this.databaseService.employee.groupBy({
      by: ['stageId'],
      where: { AND: [{ status: EmployeeStatus.ACTIVE }, scope] },
      _count: { _all: true },
    });
    if (!groups.length) return [];
    const stages = await this.databaseService.stage.findMany({
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
    return this.databaseService.employee.findUnique({
      where: { id },
      select: { id: true, status: true, jobTitle: { select: { managesPeople: true } } },
    });
  }

  /** Id and status of each existing employee among `ids` (missing ids are simply absent). */
  findStates(ids: string[]): Promise<{ id: string; status: EmployeeStatus }[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.databaseService.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
  }

  /** Read of core's stages table (allowed: read anything, write only your own). */
  findStage(id: string): Promise<{ id: string; isActive: boolean } | null> {
    return this.databaseService.stage.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
  }

  async findIdByNationalId(nationalId: string): Promise<string | null> {
    const row = await this.databaseService.employee.findUnique({
      where: { nationalId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findIdByFingerprintId(fingerprintId: string): Promise<string | null> {
    const row = await this.databaseService.employee.findUnique({
      where: { fingerprintId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findIdByInsuranceNumber(insuranceNumber: string): Promise<string | null> {
    const row = await this.databaseService.employee.findUnique({
      where: { insuranceNumber },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** The employee's current photo URL (null when none), or `undefined` when there is no such employee. */
  async findPhotoUrl(id: string): Promise<string | null | undefined> {
    const row = await this.databaseService.employee.findUnique({
      where: { id },
      select: { photoUrl: true },
    });
    return row ? row.photoUrl : undefined;
  }

  /**
   * The ids above `startId` in the manager chain, `startId` included (one recursive query).
   * UNION (not UNION ALL) stops on an existing cycle instead of looping forever.
   */
  async managerChainIds(startId: string): Promise<string[]> {
    const rows = await this.databaseService.$queryRaw<{ id: string }[]>(Prisma.sql`
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
      return await this.databaseService.$transaction(async (tx) => {
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
      return await this.databaseService.employee.update({
        where: { id },
        data,
        select: EMPLOYEE_DETAIL_SELECT,
      });
    } catch (e) {
      rethrowUnique(e);
    }
  }
}

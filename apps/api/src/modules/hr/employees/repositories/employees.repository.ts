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
} satisfies Prisma.EmployeeSelect;

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
  manager: { select: { id: true, code: true, nameEn: true, nameAr: true } },
  grade: true,
  workSystem: true,
  basicSalary: true,
  fingerprintId: true,
  contractStart: true,
  contractEnd: true,
  usesBus: true,
  status: true,
  userId: true,
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
}

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
  ): Promise<Paginated<EmployeeSummaryRow>> {
    const where: Prisma.EmployeeWhereInput = {};
    if (filter.departmentId) where.departmentId = filter.departmentId;
    if (filter.stageId) where.stageId = filter.stageId;
    if (filter.status) where.status = filter.status;
    if (filter.workSystem) where.workSystem = filter.workSystem;
    return this.findAllWithPagination(
      page,
      limit,
      search || undefined,
      ['code', 'nameEn', 'nameAr'],
      where,
      { select: EMPLOYEE_SUMMARY_SELECT, orderBy: [{ createdAt: 'asc' }, { code: 'asc' }] },
    );
  }

  findDetail(id: string): Promise<EmployeeDetailRow | null> {
    return this.databaseService.employee.findUnique({
      where: { id },
      select: EMPLOYEE_DETAIL_SELECT,
    });
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

  /** Every active employee with their department, ordered by code. */
  findActiveWithDepartments(): Promise<
    { id: string; code: string; nameEn: string; nameAr: string; department: { id: string; nameEn: string; nameAr: string } }[]
  > {
    return this.databaseService.employee.findMany({
      where: { status: EmployeeStatus.ACTIVE },
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

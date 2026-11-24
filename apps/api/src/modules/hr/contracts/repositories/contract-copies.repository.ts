import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma, type ContractCopyOutput, type ContractLanguage } from '@prisma/client';
import type { ContractDocument } from '@school-erp/shared';
import type { DbAdapter, DbClient } from '../../../../database/transactions';

const NAMED = { select: { nameEn: true, nameAr: true } } as const;

/** The employee's record a copy's values are filled from (spec → Fields). */
export const PRINT_EMPLOYEE_SELECT = {
  id: true,
  code: true,
  nameEn: true,
  nameAr: true,
  nationalId: true,
  address: true,
  hireDate: true,
  workSystem: true,
  basicSalary: true,
  managerId: true,
  jobTitle: NAMED,
  department: NAMED,
  stage: { select: { id: true, nameEn: true, nameAr: true, isNoStage: true } },
  otherStages: { select: { stageId: true } },
} satisfies Prisma.EmployeeSelect;

export type PrintEmployeeRow = Prisma.EmployeeGetPayload<{ select: typeof PRINT_EMPLOYEE_SELECT }>;

export const COPY_SELECT = {
  id: true,
  contractId: true,
  employeeId: true,
  templateId: true,
  templateNameEn: true,
  templateNameAr: true,
  language: true,
  textEdited: true,
  containsSalary: true,
  output: true,
  fileUrl: true,
  pageCount: true,
  printedById: true,
  printedByName: true,
  printedAt: true,
  templateVersion: { select: { version: true } },
  contract: { select: { startsOn: true } },
  employee: { select: { code: true } },
} satisfies Prisma.ContractCopySelect;

export type CopyRow = Prisma.ContractCopyGetPayload<{ select: typeof COPY_SELECT }>;

/**
 * Printed copies of contracts (spec → Printed copies): insert-only — there is no update or delete
 * here. Joins the caller's transaction (`txHost.tx`): the copy and its audit entry commit together.
 */
@Injectable()
export class ContractCopiesRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db(): DbClient {
    return this.txHost.tx;
  }

  findEmployee(id: string): Promise<PrintEmployeeRow | null> {
    return this.db.employee.findUnique({ where: { id }, select: PRINT_EMPLOYEE_SELECT });
  }

  /** The employee's contract in force on `today` (else their latest that isn't cancelled), for a preview. */
  async currentContractOf(employeeId: string, today: Date): Promise<{ id: string; startsOn: Date; endsOn: Date } | null> {
    const select = { id: true, startsOn: true, endsOn: true } as const;
    const current = await this.db.employeeContract.findFirst({
      where: { employeeId, status: { not: 'CANCELLED' }, startsOn: { lte: today }, endsOn: { gte: today } },
      orderBy: { startsOn: 'desc' },
      select,
    });
    if (current) return current;
    return this.db.employeeContract.findFirst({
      where: { employeeId, status: { not: 'CANCELLED' } },
      orderBy: { startsOn: 'desc' },
      select,
    });
  }

  async create(data: {
    contractId: string;
    employeeId: string;
    templateId: string;
    templateVersionId: string;
    templateNameEn: string;
    templateNameAr: string;
    language: ContractLanguage;
    document: ContractDocument;
    values: Record<string, string | null>;
    textEdited: boolean;
    containsSalary: boolean;
    output: ContractCopyOutput;
    fileUrl: string;
    pageCount: number;
    printedById: string | null;
    printedByName: string;
  }): Promise<CopyRow> {
    return this.db.contractCopy.create({
      data: { ...data, document: data.document as unknown as Prisma.InputJsonValue, values: data.values },
      select: COPY_SELECT,
    });
  }

  /** A contract's copies, newest first. */
  async pageOfContract(contractId: string, page: number, limit: number): Promise<{ rows: CopyRow[]; total: number }> {
    const where = { contractId };
    const [rows, total] = await Promise.all([
      this.db.contractCopy.findMany({
        where,
        select: COPY_SELECT,
        orderBy: [{ printedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.contractCopy.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * The newest `perContract` copies of each of these contracts, with each contract's count (an
   * employee's Contracts tab: the page's rows only; the rest page through `pageOfContract`).
   */
  async newestOfContracts(contractIds: readonly string[], perContract: number): Promise<{ rows: CopyRow[]; totals: Map<string, number> }> {
    if (contractIds.length === 0) return { rows: [], totals: new Map() };
    const [counts, rows] = await Promise.all([
      this.db.contractCopy.groupBy({ by: ['contractId'], where: { contractId: { in: [...contractIds] } }, _count: { _all: true } }),
      Promise.all(
        contractIds.map((contractId) =>
          this.db.contractCopy.findMany({
            where: { contractId },
            select: COPY_SELECT,
            orderBy: [{ printedAt: 'desc' }, { id: 'desc' }],
            take: perContract,
          }),
        ),
      ),
    ]);
    return { rows: rows.flat(), totals: new Map(counts.map((c) => [c.contractId, c._count._all])) };
  }

  /** The copy a stored file belongs to — files follow their record, found by the link. */
  findByFile(fileUrl: string): Promise<CopyFileRow | null> {
    return this.db.contractCopy.findUnique({ where: { fileUrl }, select: COPY_FILE_SELECT });
  }
}

const COPY_FILE_SELECT = {
  ...COPY_SELECT,
  employee: {
    select: { id: true, code: true, nameEn: true, nameAr: true, managerId: true, stageId: true, otherStages: { select: { stageId: true } } },
  },
} satisfies Prisma.ContractCopySelect;

export type CopyFileRow = Prisma.ContractCopyGetPayload<{ select: typeof COPY_FILE_SELECT }>;

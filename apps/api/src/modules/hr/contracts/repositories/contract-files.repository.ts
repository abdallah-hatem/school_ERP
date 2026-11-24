import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '@prisma/client';
import type { DbAdapter, DbClient } from '../../../../database/transactions';

const FILE_SELECT = {
  id: true,
  contractId: true,
  url: true,
  name: true,
  mimeType: true,
  sizeBytes: true,
  pageOrder: true,
  uploadedAt: true,
  removedAt: true,
  uploadedBy: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeContractFileSelect;

export type ContractFileRow = Prisma.EmployeeContractFileGetPayload<{ select: typeof FILE_SELECT }>;

/**
 * The pages of contracts' signed copies (§3 → Contracts, owner 2026-11-24). Never deleted: a removed
 * page keeps its row (`removedAt`, who, why). Writes run in the caller's transaction (`txHost.tx`),
 * after the contract's row is locked, so two uploads to one contract number their pages in turn.
 */
@Injectable()
export class ContractFilesRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db(): DbClient {
    return this.txHost.tx;
  }

  /** The contract's pages, removed ones aside, in upload order. */
  listActive(contractId: string): Promise<ContractFileRow[]> {
    return this.db.employeeContractFile.findMany({
      where: { contractId, removedAt: null },
      select: FILE_SELECT,
      orderBy: { pageOrder: 'asc' },
    });
  }

  /** The next page's number: after every page the contract ever had (removed ones too). */
  async nextPageOrder(contractId: string): Promise<number> {
    const { _max } = await this.db.employeeContractFile.aggregate({ where: { contractId }, _max: { pageOrder: true } });
    return (_max.pageOrder ?? 0) + 1;
  }

  create(data: Prisma.EmployeeContractFileUncheckedCreateInput): Promise<ContractFileRow> {
    return this.db.employeeContractFile.create({ data, select: FILE_SELECT });
  }

  /** One page of the contract, not removed; null otherwise. */
  findActive(contractId: string, fileId: string): Promise<ContractFileRow | null> {
    return this.db.employeeContractFile.findFirst({ where: { id: fileId, contractId, removedAt: null }, select: FILE_SELECT });
  }

  /** Soft removal: the row and the file stay, with who removed it, when and why. */
  async markRemoved(fileId: string, removedById: string | null, reason: string): Promise<void> {
    await this.db.employeeContractFile.update({
      where: { id: fileId },
      data: { removedAt: new Date(), removedById, removedReason: reason },
    });
  }

  /** The page a stored file is (files follow their record), by its link. */
  findByUrl(url: string): Promise<ContractFileRow | null> {
    return this.db.employeeContractFile.findUnique({ where: { url }, select: FILE_SELECT });
  }
}

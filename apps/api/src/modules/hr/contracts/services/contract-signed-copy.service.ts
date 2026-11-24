import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  CONTRACT_SIGNED_COPY_UPLOAD,
  ContractStatus,
  ErrorCode,
  type AuthUser,
  type ContractSignedCopy,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { AuditService } from '../../../../core/audit';
import { checkDocumentUpload, FileStorageService, type UploadedFileLike } from '../../../../core/settings';
import { AfterCommit } from '../../../../database/transactions';
import { inScope } from '../../access/employee-scope.pure';
import { HrAccessService } from '../../access/hr-access.service';
import { contractAuditLabel, contractScopeFields } from '../contracts.pure';
import { ContractFilesRepository, type ContractFileRow } from '../repositories/contract-files.repository';
import { ContractsRepository, type ContractRow } from '../repositories/contracts.repository';
import { ContractsService } from './contracts.service';

/** Folder under UPLOADS_DIR (and `/files/…`) holding the signed copies' pages — a sensitive folder. */
export const CONTRACT_SIGNED_COPY_FOLDER = 'contract-signed-copies';

const VIEW = 'hr.contracts.view' as const;

/** A multipart file with the name it was picked with. */
export type UploadedPage = UploadedFileLike & { originalname?: string };

/**
 * A contract's signed copy (§3 → Contracts, owner 2026-11-24): one or more pages — PDF, PNG, JPG or
 * WebP, each up to 10 MB, checked by their bytes — kept in upload order. Any contract may get one,
 * past, current or upcoming (old contracts are scanned too); a cancelled one never started, so it
 * doesn't (409 `CONTRACT_CANCELLED`).
 *
 * - Adding and removing load the contract like every contract write (`ContractsService.loadForWrite`):
 *   its row locked, `hr.contracts.view` and `.manage` scopes covering it (else 404), a linked account,
 *   never the actor's own contract (403 `OWN_CONTRACT`). Each is one audit entry on the contract.
 * - Removing is soft and needs a reason: the row and the file are kept; the page no longer shows or opens.
 * - Viewing needs `hr.contracts.view` covering the contract's employee (else 404); each page opened
 *   is recorded like the decision letters (`hr.contract.document_open`).
 */
@Injectable()
export class ContractSignedCopyService {
  constructor(
    private readonly contracts: ContractsService,
    private readonly contractRows: ContractsRepository,
    private readonly repository: ContractFilesRepository,
    private readonly access: HrAccessService,
    private readonly audit: AuditService,
    private readonly files: FileStorageService,
    private readonly afterCommit: AfterCommit,
  ) {}

  /** The pages in upload order. 404 for a contract outside the viewer's view scope (edge case 12). */
  async get(contractId: string): Promise<ContractSignedCopy> {
    const row = await this.contractRows.findOne(contractId);
    if (!row || !inScope(await this.access.scope(VIEW), contractScopeFields(row))) throw new NotFoundException();
    return this.present(contractId);
  }

  /** Adds one page at the end of the signed copy. */
  async add(contractId: string, file: UploadedPage | undefined): Promise<ContractSignedCopy> {
    return this.afterCommit.inTransaction(async () => {
      const [row] = await this.contracts.loadForWrite([contractId]);
      if (row.status === ContractStatus.CANCELLED) {
        throw new CodedException(HttpStatus.CONFLICT, ErrorCode.CONTRACT_CANCELLED);
      }
      const { type, buffer } = checkDocumentUpload(file, CONTRACT_SIGNED_COPY_UPLOAD);
      const actor = await this.access.actor();
      const pagesBefore = (await this.repository.listActive(contractId)).length;
      if (pagesBefore >= CONTRACT_SIGNED_COPY_UPLOAD.maxPages) {
        throw CodedException.withParams(HttpStatus.CONFLICT, ErrorCode.SIGNED_COPY_PAGE_LIMIT, {
          max: CONTRACT_SIGNED_COPY_UPLOAD.maxPages,
        });
      }
      const url = await this.files.save(CONTRACT_SIGNED_COPY_FOLDER, `${contractId}-${randomUUID()}.${type}`, buffer);
      // A failed row, entry or commit after the file is stored leaves no file behind.
      this.afterCommit.onRollback(() => this.files.remove(url));
      const page = await this.repository.create({
        contractId,
        url,
        name: uploadedName(file?.originalname, type),
        mimeType: file!.mimetype,
        sizeBytes: buffer.length,
        pageOrder: await this.repository.nextPageOrder(contractId),
        uploadedById: actor?.userId ?? null,
      });
      await this.record('hr.contract.signed_copy_add', row, { signedCopyPages: pagesBefore }, {
        signedCopyPages: pagesBefore + 1,
        signedCopyFile: page.name,
      });
      return this.present(contractId);
    });
  }

  /** Removes one page, with a reason: kept (who, when, why), no longer shown or opened. */
  async remove(contractId: string, fileId: string, reason: string): Promise<ContractSignedCopy> {
    return this.afterCommit.inTransaction(async () => {
      const [row] = await this.contracts.loadForWrite([contractId]);
      const page = await this.repository.findActive(contractId, fileId);
      if (!page) throw new NotFoundException();
      const actor = await this.access.actor();
      const pagesBefore = (await this.repository.listActive(contractId)).length;
      await this.repository.markRemoved(page.id, actor?.userId ?? null, reason);
      await this.record(
        'hr.contract.signed_copy_remove',
        row,
        { signedCopyPages: pagesBefore, signedCopyFile: page.name },
        { signedCopyPages: pagesBefore - 1, signedCopyFile: null, reason },
      );
      return this.present(contractId);
    });
  }

  /**
   * Whether `user` may open the page at `url`: a page not removed points at it, and
   * `hr.contracts.view` covers its contract's employee for them.
   */
  async canOpen(user: Pick<AuthUser, 'id'>, url: string): Promise<boolean> {
    const page = await this.repository.findByUrl(url);
    if (!page || page.removedAt) return false;
    const row = await this.contractRows.findOne(page.contractId);
    if (!row) return false;
    return inScope(await this.access.scopeOf(user, VIEW), contractScopeFields(row));
  }

  /** Records the opening of a page (a sensitive folder), in a transaction of its own. */
  async recordOpened(url: string): Promise<void> {
    await this.afterCommit.inTransaction(async () => {
      const page = await this.repository.findByUrl(url);
      const row = page ? await this.contractRows.findOne(page.contractId) : null;
      if (!page || !row) throw new NotFoundException();
      await this.audit.record({
        action: 'hr.contract.document_open',
        entity: { type: AuditEntityType.EMPLOYEE_CONTRACT, id: row.id, label: contractAuditLabel(row) },
        changes: [{ field: 'document', before: null, after: page.name }],
      });
    });
  }

  private record(
    action: 'hr.contract.signed_copy_add' | 'hr.contract.signed_copy_remove',
    row: ContractRow,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      entity: { type: AuditEntityType.EMPLOYEE_CONTRACT, id: row.id, label: contractAuditLabel(row) },
      before,
      after,
    });
  }

  private async present(contractId: string): Promise<ContractSignedCopy> {
    return { contractId, files: (await this.repository.listActive(contractId)).map(toSignedCopyFile) };
  }
}

function toSignedCopyFile(row: ContractFileRow): ContractSignedCopy['files'][number] {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    page: row.pageOrder,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}

/**
 * The name a page was picked with, as shown in the viewer: multipart names arrive as Latin-1 bytes
 * (an Arabic name would read as mojibake), so they are read back as UTF-8 when that is what they
 * are; no path, no control characters, at most 200 characters. None → `page.<ext>`.
 */
export function uploadedName(original: string | undefined, type: string): string {
  let name = original ?? '';
  // eslint-disable-next-line no-control-regex
  if (/^[\u0000-ÿ]*$/.test(name)) {
    const utf8 = Buffer.from(name, 'latin1').toString('utf8');
    if (!utf8.includes('�')) name = utf8;
  }
  // eslint-disable-next-line no-control-regex
  name = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return name ? name.slice(0, 200) : `page.${type}`;
}

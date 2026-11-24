import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  ErrorCode,
  PAGINATION,
  parseContractDocument,
  type ContractDocument,
  type ContractTemplate,
  type ContractTemplateSummary,
  type ContractTemplateVersion,
  type ContractTemplateVersionSummary,
  type CreateContractTemplateRequest,
  type Paginated,
  type PaginationQuery,
  type SaveContractTemplateResponse,
  type UpdateContractTemplateRequest,
  type WorkSystem,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { AuditService } from '../../../../core/audit';
import { AfterCommit } from '../../../../database/transactions';
import { HrAccessService } from '../../access/hr-access.service';
import {
  templateAuditLabel,
  templateAuditSnapshot,
  textChanged,
  toSummary,
  toTemplate,
  toVersion,
  toVersionSummary,
  versionFacts,
} from '../contract-templates.pure';
import {
  ContractTemplatesRepository,
  uniqueViolationOn,
  type TemplateWithVersion,
} from '../repositories/contract-templates.repository';

/** A refusal from the shared document check, as the API answers it. */
function documentRefusal(input: unknown, requireContent: boolean): ContractDocument {
  const parsed = parseContractDocument(input, { requireContent });
  if (!parsed.ok) throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode[parsed.problem]);
  return parsed.document;
}

function paged<T>(data: T[], total: number, page: number, limit: number): Paginated<T> {
  return { data, total, page, limit, hasNextPage: page * limit < total, hasPreviousPage: page > 1 };
}

/**
 * Contract templates (spec 2026-11-24-contract-templates → Templates; Settings → HR → Contract
 * templates, `hr.contract_templates.manage`). Never deleted, only hidden. A save that changes a text
 * (either language) adds a version — kept forever, copies keep theirs; names, hiding and the
 * default mark are not versions. A stale `baseVersion` is 409 `TEMPLATE_CHANGED` (edge case 12).
 * Each write is one `hr.contract_template.*` entry in the request's transaction.
 */
@Injectable()
export class ContractTemplatesService {
  constructor(
    private readonly repository: ContractTemplatesRepository,
    private readonly access: HrAccessService,
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
  ) {}

  async list(query: PaginationQuery & { hidden?: boolean }): Promise<Paginated<ContractTemplateSummary>> {
    const page = query.page ?? PAGINATION.defaultPage;
    const limit = query.limit ?? PAGINATION.defaultLimit;
    const { rows, total } = await this.repository.listPage({ search: query.search, includeHidden: query.hidden === true }, page, limit);
    return paged(rows.map(toSummary), total, page, limit);
  }

  async get(id: string): Promise<ContractTemplate> {
    return toTemplate(await this.load(id));
  }

  async versions(id: string, query: PaginationQuery): Promise<Paginated<ContractTemplateVersionSummary>> {
    await this.load(id);
    const page = query.page ?? PAGINATION.defaultPage;
    const limit = query.limit ?? PAGINATION.defaultLimit;
    const { rows, total } = await this.repository.versionsPage(id, page, limit);
    return paged(rows.map(toVersionSummary), total, page, limit);
  }

  async version(id: string, version: number): Promise<ContractTemplateVersion> {
    const row = await this.repository.findVersion(id, version);
    if (!row) throw new NotFoundException();
    return toVersion(row);
  }

  /** Version 1; the work system's default moves to it when asked (the old holder loses the mark). */
  async create(dto: CreateContractTemplateRequest): Promise<SaveContractTemplateResponse> {
    const bodyAr = documentRefusal(dto.bodyAr, true);
    const bodyEn = dto.bodyEn ? documentRefusal(dto.bodyEn, false) : null;
    return this.afterCommit.inTransaction(async () => {
      await this.assertNamesFree(dto.nameEn, dto.nameAr, null);
      const actor = await this.access.actor();
      const tookDefaultFrom = await this.takeDefault(dto.defaultForWorkSystem, null);
      const id = await this.guardUnique(() =>
        this.repository.create({
          nameEn: dto.nameEn,
          nameAr: dto.nameAr,
          defaultForWorkSystem: dto.defaultForWorkSystem,
          actorId: actor?.userId ?? null,
        }),
        dto.defaultForWorkSystem,
      );
      await this.repository.addVersion({ templateId: id, version: 1, bodyAr, bodyEn, ...versionFacts(bodyAr, bodyEn), actorId: actor?.userId ?? null });
      const after = await this.load(id);
      await this.audit.record({
        action: 'hr.contract_template.create',
        entity: { type: AuditEntityType.CONTRACT_TEMPLATE, id, label: templateAuditLabel(after.template) },
        before: null,
        after: templateAuditSnapshot(after),
      });
      return { template: toTemplate(after), tookDefaultFrom };
    });
  }

  /**
   * Saves names, the default mark and the texts. A changed text makes version `baseVersion + 1`; a
   * `baseVersion` that isn't the current one means someone saved meanwhile — 409, nothing written.
   * A hidden template can't be made a default (edge case 10, `TEMPLATE_HIDDEN`).
   */
  async update(id: string, dto: UpdateContractTemplateRequest): Promise<SaveContractTemplateResponse> {
    const bodyAr = documentRefusal(dto.bodyAr, true);
    const bodyEn = dto.bodyEn ? documentRefusal(dto.bodyEn, false) : null;
    return this.afterCommit.inTransaction(async () => {
      await this.repository.lock(id);
      const before = await this.load(id);
      if (before.template.currentVersion !== dto.baseVersion) {
        throw new CodedException(HttpStatus.CONFLICT, ErrorCode.TEMPLATE_CHANGED);
      }
      if (dto.defaultForWorkSystem && before.template.hiddenAt !== null) {
        throw new CodedException(HttpStatus.CONFLICT, ErrorCode.TEMPLATE_HIDDEN);
      }
      await this.assertNamesFree(dto.nameEn, dto.nameAr, id);
      const actor = await this.access.actor();
      const tookDefaultFrom =
        dto.defaultForWorkSystem && dto.defaultForWorkSystem !== before.template.defaultForWorkSystem
          ? await this.takeDefault(dto.defaultForWorkSystem, id)
          : null;
      const changedText = textChanged(before.version, { bodyAr, bodyEn });
      const version = changedText ? before.template.currentVersion + 1 : before.template.currentVersion;
      if (changedText) {
        await this.repository.addVersion({ templateId: id, version, bodyAr, bodyEn, ...versionFacts(bodyAr, bodyEn), actorId: actor?.userId ?? null });
      }
      await this.guardUnique(
        () =>
          this.repository.update(id, {
            nameEn: dto.nameEn,
            nameAr: dto.nameAr,
            defaultForWorkSystem: dto.defaultForWorkSystem,
            currentVersion: version,
            updatedById: actor?.userId ?? null,
          }),
        dto.defaultForWorkSystem,
      );
      const after = await this.load(id);
      // "Text changed: version 3 → 4" (spec → Audit): the version and languages lines, never the texts.
      await this.audit.record({
        action: 'hr.contract_template.update',
        entity: { type: AuditEntityType.CONTRACT_TEMPLATE, id, label: templateAuditLabel(after.template) },
        before: templateAuditSnapshot(before),
        after: templateAuditSnapshot(after),
      });
      return { template: toTemplate(after), tookDefaultFrom };
    });
  }

  /** Hidden: out of the print picker, its copies kept, and its default mark lost for good (edge case 10). */
  async hide(id: string): Promise<ContractTemplate> {
    return this.setHidden(id, true);
  }

  /** Shown again: back in the picker, not a default (spec → Templates). */
  async show(id: string): Promise<ContractTemplate> {
    return this.setHidden(id, false);
  }

  private async setHidden(id: string, hidden: boolean): Promise<ContractTemplate> {
    return this.afterCommit.inTransaction(async () => {
      await this.repository.lock(id);
      const before = await this.load(id);
      const actor = await this.access.actor();
      if ((before.template.hiddenAt !== null) !== hidden) {
        await this.repository.update(id, {
          hiddenAt: hidden ? new Date() : null,
          ...(hidden ? { defaultForWorkSystem: null } : {}),
          updatedById: actor?.userId ?? null,
        });
      }
      const after = await this.load(id);
      await this.audit.record({
        action: hidden ? 'hr.contract_template.hide' : 'hr.contract_template.show',
        entity: { type: AuditEntityType.CONTRACT_TEMPLATE, id, label: templateAuditLabel(after.template) },
        before: templateAuditSnapshot(before),
        after: templateAuditSnapshot(after),
      });
      return toTemplate(after);
    });
  }

  private async load(id: string): Promise<TemplateWithVersion> {
    const row = await this.repository.findOne(id);
    if (!row) throw new NotFoundException();
    return row;
  }

  private async assertNamesFree(nameEn: string, nameAr: string, exceptId: string | null): Promise<void> {
    if (await this.repository.nameTaken(nameEn, nameAr, exceptId)) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.TEMPLATE_NAME_TAKEN);
    }
  }

  /**
   * Takes a work system's default from the template holding it (spec → Templates: one default per
   * work system); that one loses the mark, with its own entry. Returns it for the screen's notice.
   */
  private async takeDefault(workSystem: WorkSystem | null, forId: string | null): Promise<SaveContractTemplateResponse['tookDefaultFrom']> {
    if (!workSystem) return null;
    const holder = await this.repository.findDefault(workSystem, forId);
    if (!holder) return null;
    await this.repository.lock(holder.id);
    const before = await this.load(holder.id);
    const actor = await this.access.actor();
    await this.repository.update(holder.id, { defaultForWorkSystem: null, updatedById: actor?.userId ?? null });
    const after = await this.load(holder.id);
    await this.audit.record({
      action: 'hr.contract_template.update',
      entity: { type: AuditEntityType.CONTRACT_TEMPLATE, id: holder.id, label: templateAuditLabel(after.template) },
      before: templateAuditSnapshot(before),
      after: templateAuditSnapshot(after),
    });
    return holder;
  }

  /**
   * Edge case 11: two templates claiming one work system's default at once — the partial unique
   * index lets one win; the other is told to save again. A name taken at the same moment likewise.
   */
  private async guardUnique<T>(write: () => Promise<T>, workSystem: WorkSystem | null): Promise<T> {
    try {
      return await write();
    } catch (error) {
      const on = uniqueViolationOn(error);
      if (on === 'default' && workSystem) {
        throw CodedException.withParams(HttpStatus.CONFLICT, ErrorCode.TEMPLATE_DEFAULT_TAKEN, { workSystem });
      }
      if (on === 'name') throw new CodedException(HttpStatus.CONFLICT, ErrorCode.TEMPLATE_NAME_TAKEN);
      throw error;
    }
  }
}

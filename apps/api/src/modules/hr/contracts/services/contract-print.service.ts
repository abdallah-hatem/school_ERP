import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  CONTRACT_FIELDS,
  CONTRACT_SALARY_FIELDS,
  ContractStatus,
  contractFieldValues,
  contractPhase,
  contractYearOf,
  documentUsesSalary,
  ErrorCode,
  fillContractDocument,
  PAGINATION,
  parseContractDocument,
  renderContractDocument,
  type AuthUser,
  type ContractCopy,
  type ContractDocument,
  type ContractFieldKey,
  type ContractFieldValues,
  type ContractLanguage,
  type ContractPrintPreview,
  type ContractPrintTemplateOption,
  type ContractTemplatePreview,
  type CreateContractCopyRequest,
  type IsoDate,
  type Paginated,
  type PaginationQuery,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { fontDataUrl, PdfRenderer } from '../../../../common/pdf/pdf-renderer.service';
import { fromIsoDate, todayIsoDate, toIsoDate } from '../../../../common/utils/dates.util';
import { AuditService } from '../../../../core/audit';
import { FileStorageService, SettingsService } from '../../../../core/settings';
import { AfterCommit } from '../../../../database/transactions';
import { inScope, type EmployeeScope, type ScopedEmployee } from '../../access/employee-scope.pure';
import { HrAccessService, VIEW_SALARY } from '../../access/hr-access.service';
import { ContractTemplatesRepository, type TemplateWithVersion } from '../../contract-templates/repositories/contract-templates.repository';
import {
  contractFooterTemplate,
  contractPdfHtml,
  printValuesHash,
  toCopy,
  type PdfFonts,
} from '../contract-print.pure';
import { contractAuditLabel, contractScopeFields } from '../contracts.pure';
import { ContractCopiesRepository, type CopyRow, type PrintEmployeeRow } from '../repositories/contract-copies.repository';
import { ContractsRepository, type ContractRow } from '../repositories/contracts.repository';

/** Folder under UPLOADS_DIR (and `/files/…`) holding printed copies' PDFs — a sensitive folder. */
export const CONTRACT_COPY_FOLDER = 'contract-copies';

const VIEW = 'hr.contracts.view' as const;
const MANAGE = 'hr.contracts.manage' as const;

const isSalary = (key: ContractFieldKey) => CONTRACT_FIELDS[key].salary;

let fonts: PdfFonts | null = null;
/** The bundled OFL fonts (IBM Plex Sans Arabic, Plus Jakarta Sans), read once. */
function pdfFonts(): PdfFonts {
  fonts ??= {
    arabic400: fontDataUrl('@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2'),
    arabic700: fontDataUrl('@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2'),
    latin400: fontDataUrl('@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff2'),
    latin700: fontDataUrl('@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2'),
  };
  return fonts;
}

const LOGO_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

function scopeFieldsOf(employee: { id: string; managerId: string | null; stageId?: string; stage?: { id: string }; otherStages: { stageId: string }[] }): ScopedEmployee {
  return {
    id: employee.id,
    stageId: employee.stageId ?? employee.stage?.id ?? '',
    managerId: employee.managerId,
    otherStageIds: employee.otherStages.map((s) => s.stageId),
  };
}

interface PrintContext {
  row: ContractRow;
  employee: PrintEmployeeRow;
  salaryVisible: boolean;
}

/**
 * Printing a contract from a template, and its kept copies (spec 2026-11-24-contract-templates →
 * Printing, Printed copies). Who prints: `hr.contracts.manage` and `hr.contracts.view` covering the
 * employee (else 404), never one's own contract (403 `OWN_CONTRACT`), never a cancelled one. A
 * template with a salary field needs that employee's salary (`hr.employees.view_salary`), or it is
 * refused (`SALARY_NOT_VISIBLE`). The server fills the values itself; a change since the preview is
 * a 409. The PDF is made first, then one transaction keeps the copy and its entry.
 */
@Injectable()
export class ContractPrintService {
  constructor(
    private readonly contracts: ContractsRepository,
    private readonly copies: ContractCopiesRepository,
    private readonly templates: ContractTemplatesRepository,
    private readonly access: HrAccessService,
    private readonly settings: SettingsService,
    private readonly files: FileStorageService,
    private readonly pdf: PdfRenderer,
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
  ) {}

  /** The school's today (Cairo). A test fixes it. */
  today(): IsoDate {
    return todayIsoDate();
  }

  // ── the print picker and preview ────────────────────────────────────────────

  /** `GET /hr/contracts/:id/print-templates` — the shown templates, the work system's default marked. */
  async printTemplates(contractId: string, query: PaginationQuery): Promise<Paginated<ContractPrintTemplateOption>> {
    const { employee, salaryVisible } = await this.loadForPrint(contractId);
    const page = query.page ?? PAGINATION.defaultPage;
    const limit = query.limit ?? PAGINATION.defaultLimit;
    const { rows, total } = await this.templates.listPage({ search: query.search, includeHidden: false }, page, limit);
    return {
      data: rows.map(({ template, version }) => ({
        id: template.id,
        nameEn: template.nameEn,
        nameAr: template.nameAr,
        version: template.currentVersion,
        hasEnglish: version.bodyEn !== null,
        usesSalary: version.usesSalary,
        isDefault: template.defaultForWorkSystem === employee.workSystem,
        salaryBlocked: version.usesSalary && !salaryVisible,
      })),
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }

  /** `GET /hr/contracts/:id/print` — what the dialog shows (spec → Screens → Print contract dialog). */
  async preview(contractId: string, templateId: string, language: ContractLanguage): Promise<ContractPrintPreview> {
    const context = await this.loadForPrint(contractId);
    const template = await this.printableTemplate(templateId);
    const document = this.documentOf(template, language);
    if (documentUsesSalary(document, isSalary) && !context.salaryVisible) {
      throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.SALARY_NOT_VISIBLE);
    }
    const values = await this.valuesFor(context, language);
    const rendered = renderContractDocument(document, { language, values });
    const school = await this.settings.getSchoolSettings();
    const { row } = context;
    const startsOn = toIsoDate(row.startsOn);
    const endsOn = toIsoDate(row.endsOn);
    const endedOn = row.endedOn ? toIsoDate(row.endedOn) : null;
    const today = this.today();
    const lastDay = endedOn ?? endsOn;
    return {
      contract: {
        id: row.id,
        startsOn,
        endsOn,
        status: row.status,
        phase: contractPhase({ status: row.status, startsOn, endsOn, endedOn }, today),
        year: contractYearOf(startsOn),
        endedOn: lastDay < today ? lastDay : null,
      },
      employee: { id: row.employee.id, code: row.employee.code, nameEn: row.employee.nameEn, nameAr: row.employee.nameAr },
      template: {
        id: template.template.id,
        nameEn: template.template.nameEn,
        nameAr: template.template.nameAr,
        version: template.template.currentVersion,
        hasEnglish: template.version.bodyEn !== null,
      },
      language,
      document,
      values,
      emptyFields: rendered.emptyFields,
      phrasesLeftOut: rendered.phrasesLeftOut,
      logoUrl: school.logoUrl,
      valuesHash: printValuesHash({ versionId: template.version.id, language, values }),
      copies: (await this.copies.ofContracts([row.id])).map((c) => toCopy(c, this.mayOpen(c, context.salaryVisible))),
    };
  }

  // ── making a copy ───────────────────────────────────────────────────────────

  /**
   * `POST /hr/contracts/:id/copies` (spec → Printing, edge cases 4, 15, 16): refills on the server,
   * refuses a stale template version (409 `TEMPLATE_CHANGED`) or values (409 `VALUES_CHANGED`),
   * checks the copy's edited text with the shared schema and the salary rule, renders the PDF —
   * outside any transaction (up to 20 s, queued) — and then keeps the file link, the copy and its
   * `hr.contract.copy_print` entry in one transaction. A failed render keeps nothing; a failed
   * transaction leaves a file nobody's record points at (it opens for nobody) and deletes it.
   */
  async createCopy(contractId: string, dto: CreateContractCopyRequest): Promise<ContractCopy> {
    const context = await this.loadForPrint(contractId);
    const template = await this.printableTemplate(dto.templateId);
    if (template.template.currentVersion !== dto.templateVersion) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.TEMPLATE_CHANGED);
    }
    const templateDocument = this.documentOf(template, dto.language);
    let document = templateDocument;
    if (dto.bodyEdited !== undefined) {
      const parsed = parseContractDocument(dto.bodyEdited, { requireContent: true });
      if (!parsed.ok) throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode[parsed.problem]);
      document = parsed.document;
    }
    const textEdited = JSON.stringify(document) !== JSON.stringify(templateDocument);
    const containsSalary = documentUsesSalary(document, isSalary);
    // Edge case 4: a salary field added in "Edit text" is refused like a template's.
    if (containsSalary && !context.salaryVisible) {
      throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.SALARY_NOT_VISIBLE);
    }
    const values = await this.valuesFor(context, dto.language);
    if (printValuesHash({ versionId: template.version.id, language: dto.language, values }) !== dto.valuesHash) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.VALUES_CHANGED);
    }

    const school = await this.settings.getSchoolSettings();
    const rendered = renderContractDocument(document, {
      language: dto.language,
      values,
      letterhead: { logoSrc: await this.logoDataUrl(school.logoUrl) },
    });
    const templateName = dto.language === 'AR' ? template.template.nameAr : template.template.nameEn;
    const { pdf, pageCount } = await this.pdf.render(contractPdfHtml(rendered.html, pdfFonts(), dto.language), {
      footerTemplate: contractFooterTemplate({
        schoolName: dto.language === 'AR' ? school.nameAr : school.nameEn,
        templateName,
        language: dto.language,
        fonts: pdfFonts(),
      }),
    });

    // The file name is ours and random (edge case 25); the download name is built from the record.
    const name = `${randomUUID()}.pdf`;
    const fileUrl = await this.files.save(CONTRACT_COPY_FOLDER, name, pdf);
    const usedValues = Object.fromEntries(rendered.fields.map((key) => [key, values[key]]));
    return this.afterCommit.inTransaction(async () => {
      this.afterCommit.onRollback(() => this.files.remove(fileUrl));
      const actor = await this.access.actor();
      const row = await this.copies.create({
        contractId: context.row.id,
        employeeId: context.row.employeeId,
        templateId: template.template.id,
        templateVersionId: template.version.id,
        templateNameEn: template.template.nameEn,
        templateNameAr: template.template.nameAr,
        language: dto.language,
        document: fillContractDocument(document, values),
        values: usedValues,
        textEdited,
        containsSalary,
        output: dto.output,
        fileUrl,
        pageCount,
        printedById: actor?.userId ?? null,
        printedByName: this.access.actorName() ?? 'System',
      });
      // Spec → Audit: template and version, language, edited yes/no, PDF or print — no amounts.
      await this.audit.record({
        action: 'hr.contract.copy_print',
        entity: { type: AuditEntityType.EMPLOYEE_CONTRACT, id: context.row.id, label: contractAuditLabel(context.row) },
        changes: [
          { field: 'template', before: null, after: { nameEn: template.template.nameEn, nameAr: template.template.nameAr } },
          { field: 'templateVersion', before: null, after: template.template.currentVersion },
          { field: 'language', before: null, after: dto.language },
          { field: 'textEdited', before: null, after: textEdited },
          { field: 'output', before: null, after: dto.output },
        ],
      });
      return toCopy(row, true);
    });
  }

  // ── reading copies ──────────────────────────────────────────────────────────

  /** `GET /hr/contracts/:id/copies` — `hr.contracts.view` covering the employee (else 404). */
  async listCopies(contractId: string, query: PaginationQuery): Promise<Paginated<ContractCopy>> {
    const row = await this.contracts.findOne(contractId);
    if (!row || !inScope(await this.access.scope(VIEW), contractScopeFields(row))) throw new NotFoundException();
    const salaryVisible = inScope(await this.access.salaryScope(), contractScopeFields(row));
    const page = query.page ?? PAGINATION.defaultPage;
    const limit = query.limit ?? PAGINATION.defaultLimit;
    const { rows, total } = await this.copies.pageOfContract(contractId, page, limit);
    return {
      data: rows.map((c) => toCopy(c, this.mayOpen(c, salaryVisible))),
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }

  /**
   * The copies of the contracts on one page of an employee's history (the Contracts tab), newest
   * first. The caller already checked `hr.contracts.view` covers the employee.
   */
  async copiesOf(rows: readonly ContractRow[]): Promise<Map<string, ContractCopy[]>> {
    const salaryScope = await this.access.salaryScope();
    const visible = new Map(rows.map((r) => [r.id, inScope(salaryScope, contractScopeFields(r))]));
    const out = new Map<string, ContractCopy[]>(rows.map((r) => [r.id, []]));
    for (const copy of await this.copies.ofContracts(rows.map((r) => r.id))) {
      out.get(copy.contractId)?.push(toCopy(copy, this.mayOpen(copy, visible.get(copy.contractId) ?? false)));
    }
    return out;
  }

  /**
   * Whether `user` may open the copy at `url` (files follow their record): a copy points at it,
   * `hr.contracts.view` covers its employee for them, and — for a copy holding a salary — their
   * `hr.employees.view_salary` covers that employee too. Otherwise 404 (edge case 24).
   */
  async canOpenCopy(user: Pick<AuthUser, 'id'>, url: string): Promise<boolean> {
    const copy = await this.copies.findByFile(url);
    if (!copy) return false;
    const scope = scopeFieldsOf(copy.employee);
    if (!inScope(await this.access.scopeOf(user, VIEW), scope)) return false;
    if (!copy.containsSalary) return true;
    return inScope(await this.access.scopeOf(user, VIEW_SALARY), scope);
  }

  /** Records the opening of a printed copy (`hr.contract.copy_open`), in a transaction of its own. */
  async recordCopyOpened(url: string): Promise<void> {
    await this.afterCommit.inTransaction(async () => {
      const copy = await this.copies.findByFile(url);
      if (!copy) throw new NotFoundException();
      await this.audit.record({
        action: 'hr.contract.copy_open',
        entity: {
          type: AuditEntityType.EMPLOYEE_CONTRACT,
          id: copy.contractId,
          label: { en: copy.employee.nameEn, ar: copy.employee.nameAr },
        },
        changes: [{ field: 'copy', before: null, after: copy.id }],
      });
    });
  }

  // ── "Preview with an employee" (the template editor) ───────────────────────

  /**
   * The values of an employee's current contract for the editor's preview (read-only, nothing kept).
   * Needs `hr.contracts.view` covering the employee (else 404); salary fields the reader may not see
   * are listed in `hidden`, their values null.
   */
  async templatePreview(employeeId: string, language: ContractLanguage): Promise<ContractTemplatePreview> {
    const employee = await this.copies.findEmployee(employeeId);
    if (!employee) throw new NotFoundException();
    const scope = scopeFieldsOf(employee);
    if (!inScope(await this.access.scope(VIEW), scope)) throw new NotFoundException();
    const salaryVisible = inScope(await this.access.salaryScope(), scope);
    const contract = await this.copies.currentContractOf(employeeId, fromIsoDate(this.today()));
    const school = await this.settings.getSchoolSettings();
    const values = contractFieldValues(
      {
        employee: this.employeeSource(employee, salaryVisible),
        contract: contract
          ? { startsOn: toIsoDate(contract.startsOn), endsOn: toIsoDate(contract.endsOn) }
          : { startsOn: this.today(), endsOn: this.today() },
        school,
        today: this.today(),
      },
      language,
    );
    if (!contract) {
      values['contract.start'] = null;
      values['contract.end'] = null;
    }
    return {
      employee: { id: employee.id, code: employee.code, nameEn: employee.nameEn, nameAr: employee.nameAr },
      contract: contract ? { id: contract.id, startsOn: toIsoDate(contract.startsOn), endsOn: toIsoDate(contract.endsOn) } : null,
      language,
      values,
      hidden: salaryVisible ? [] : [...CONTRACT_SALARY_FIELDS],
    };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * The contract to print, with its employee: covered by both the view and the manage scope (else
   * 404, edge case 3), not the actor's own (403 `OWN_CONTRACT`, edge case 1; the account must be
   * linked to tell), not cancelled (`CONTRACT_CANCELLED`, edge case 13). Upcoming, ended and an
   * inactive employee's contracts print (edge cases 13, 14).
   */
  private async loadForPrint(contractId: string): Promise<PrintContext> {
    const row = await this.contracts.findOne(contractId);
    if (!row) throw new NotFoundException();
    const fields = contractScopeFields(row);
    const [view, manage]: EmployeeScope[] = await Promise.all([this.access.scope(VIEW), this.access.scope(MANAGE)]);
    if (!inScope(view, fields) || !inScope(manage, fields)) throw new NotFoundException();
    await this.access.assertLinkedForPay();
    const actor = await this.access.actor();
    if (actor?.employeeId && actor.employeeId === row.employeeId) {
      throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.OWN_CONTRACT);
    }
    if (row.status === ContractStatus.CANCELLED) throw new CodedException(HttpStatus.CONFLICT, ErrorCode.CONTRACT_CANCELLED);
    const employee = await this.copies.findEmployee(row.employeeId);
    if (!employee) throw new NotFoundException();
    const salaryVisible = inScope(await this.access.salaryScope(), fields);
    return { row, employee, salaryVisible };
  }

  /** A shown template (404 unknown, 409 `TEMPLATE_HIDDEN`). */
  private async printableTemplate(templateId: string): Promise<TemplateWithVersion> {
    const template = await this.templates.findOne(templateId);
    if (!template) throw new NotFoundException();
    if (template.template.hiddenAt !== null) throw new CodedException(HttpStatus.CONFLICT, ErrorCode.TEMPLATE_HIDDEN);
    return template;
  }

  /** The version's text in `language` (edge case 9: no English text → `NO_ENGLISH_TEXT`). */
  private documentOf(template: TemplateWithVersion, language: ContractLanguage): ContractDocument {
    const body = language === 'AR' ? template.version.bodyAr : template.version.bodyEn;
    if (body === null || body === undefined) throw new CodedException(HttpStatus.CONFLICT, ErrorCode.NO_ENGLISH_TEXT);
    return body as unknown as ContractDocument;
  }

  private employeeSource(employee: PrintEmployeeRow, salaryVisible: boolean) {
    return {
      code: employee.code,
      nameEn: employee.nameEn,
      nameAr: employee.nameAr,
      nationalId: employee.nationalId,
      address: employee.address,
      jobTitle: employee.jobTitle,
      department: employee.department,
      // Edge case 20: the "no stage" entry prints as an empty Stage.
      stage: employee.stage.isNoStage ? null : employee.stage,
      hireDate: toIsoDate(employee.hireDate),
      workSystem: employee.workSystem,
      basicSalary: salaryVisible ? employee.basicSalary : null,
    };
  }

  /**
   * Every field's value now, in the copy's language: this contract's own dates as signed, the
   * employee's record and salary today (spec → Fields), the school's settings, today (Cairo).
   */
  private async valuesFor(context: PrintContext, language: ContractLanguage): Promise<ContractFieldValues> {
    return contractFieldValues(
      {
        employee: this.employeeSource(context.employee, context.salaryVisible),
        contract: { startsOn: toIsoDate(context.row.startsOn), endsOn: toIsoDate(context.row.endsOn) },
        school: await this.settings.getSchoolSettings(),
        today: this.today(),
      },
      language,
    );
  }

  /** A copy holding a salary opens only for a reader who may see that salary. */
  private mayOpen(copy: Pick<CopyRow, 'containsSalary'>, salaryVisible: boolean): boolean {
    return !copy.containsSalary || salaryVisible;
  }

  /** The school's logo as a data URL for the letterhead (the PDF page loads nothing), or null. */
  private async logoDataUrl(logoUrl: string | null): Promise<string | null> {
    if (!logoUrl) return null;
    const mime = LOGO_MIME[logoUrl.split('.').pop()?.toLowerCase() ?? ''];
    if (!mime) return null;
    const bytes = await this.files.readUrl(logoUrl);
    return bytes ? `data:${mime};base64,${bytes.toString('base64')}` : null;
  }
}


import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma, type WorkSystem } from '@prisma/client';
import { searchWhere } from '../../../../common/repositories/search';
import type { ContractDocument } from '@school-erp/shared';
import type { DbAdapter, DbClient } from '../../../../database/transactions';

const USER_REF = { select: { id: true, name: true } } as const;

/** A version without its texts: what lists read (the texts are up to 200 KB each). */
const VERSION_SUMMARY_SELECT = {
  id: true,
  version: true,
  hasEnglish: true,
  usesSalary: true,
  fields: true,
  createdAt: true,
  createdBy: USER_REF,
} satisfies Prisma.ContractTemplateVersionSelect;

const VERSION_SELECT = { ...VERSION_SUMMARY_SELECT, bodyAr: true, bodyEn: true } satisfies Prisma.ContractTemplateVersionSelect;

export type TemplateVersionSummaryRow = Prisma.ContractTemplateVersionGetPayload<{ select: typeof VERSION_SUMMARY_SELECT }>;
export type TemplateVersionRow = Prisma.ContractTemplateVersionGetPayload<{ select: typeof VERSION_SELECT }>;

export const TEMPLATE_SELECT = {
  id: true,
  nameEn: true,
  nameAr: true,
  defaultForWorkSystem: true,
  hiddenAt: true,
  currentVersion: true,
  createdAt: true,
  updatedAt: true,
  createdBy: USER_REF,
  updatedBy: USER_REF,
} satisfies Prisma.ContractTemplateSelect;

export type TemplateRow = Prisma.ContractTemplateGetPayload<{ select: typeof TEMPLATE_SELECT }>;

/** A template with its current version (the texts and the salary mark). */
export interface TemplateWithVersion {
  template: TemplateRow;
  version: TemplateVersionRow;
}

/** A list row: the template with its current version's facts, never its texts. */
export interface TemplateSummaryRow {
  template: TemplateRow;
  version: TemplateVersionSummaryRow;
}

/**
 * Contract templates and their versions (spec 2026-11-24-contract-templates → Data). Joins the
 * caller's transaction (`txHost.tx`) so a save, its version and its audit entry commit together.
 * Templates are never deleted; versions are insert-only.
 */
@Injectable()
export class ContractTemplatesRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db(): DbClient {
    return this.txHost.tx;
  }

  /**
   * One page, searched by either name (the shared search); hidden ones only when asked. Lists read
   * no texts. `pinFirst`: that template (when it matches) leads page 1 — the print picker's
   * work-system default, so it is never beyond the first page.
   */
  async listPage(
    filter: { search?: string; includeHidden: boolean; pinFirst?: string | null },
    page: number,
    limit: number,
  ): Promise<{ rows: TemplateSummaryRow[]; total: number }> {
    const where: Prisma.ContractTemplateWhereInput = {
      ...(filter.includeHidden ? {} : { hiddenAt: null }),
      ...(searchWhere(filter.search) ?? {}),
    };
    // Shown first, then by name; the id breaks ties so pages never overlap.
    const orderBy: Prisma.ContractTemplateOrderByWithRelationInput[] = [
      { hiddenAt: { sort: 'asc', nulls: 'first' } },
      { nameEn: 'asc' },
      { id: 'asc' },
    ];
    const pinned = filter.pinFirst
      ? await this.db.contractTemplate.findFirst({ where: { AND: [where, { id: filter.pinFirst }] }, select: TEMPLATE_SELECT })
      : null;
    const rest: Prisma.ContractTemplateWhereInput = pinned ? { AND: [where, { id: { not: pinned.id } }] } : where;
    const skip = Math.max(0, (page - 1) * limit - (pinned ? 1 : 0));
    const take = pinned && page === 1 ? limit - 1 : limit;
    const [templates, total] = await Promise.all([
      take > 0 ? this.db.contractTemplate.findMany({ where: rest, select: TEMPLATE_SELECT, orderBy, skip, take }) : Promise.resolve([]),
      this.db.contractTemplate.count({ where }),
    ]);
    const rows = pinned && page === 1 ? [pinned, ...templates] : templates;
    return { rows: await this.withVersions(rows, VERSION_SUMMARY_SELECT), total };
  }

  async findOne(id: string): Promise<TemplateWithVersion | null> {
    const template = await this.db.contractTemplate.findUnique({ where: { id }, select: TEMPLATE_SELECT });
    if (!template) return null;
    const [row] = await this.withVersions([template], VERSION_SELECT);
    return row ?? null;
  }

  /** Locks the template row for a save (two editors: the second reads the first's version). */
  async lock(id: string): Promise<void> {
    await this.db.$queryRaw`SELECT "id" FROM "contract_templates" WHERE "id" = ${id}::uuid FOR NO KEY UPDATE`;
  }

  /** Another template with this English or Arabic name (case-insensitive), or null. */
  async nameTaken(nameEn: string, nameAr: string, exceptId: string | null): Promise<boolean> {
    const found = await this.db.contractTemplate.findFirst({
      where: {
        ...(exceptId ? { id: { not: exceptId } } : {}),
        OR: [{ nameEn: { equals: nameEn, mode: 'insensitive' } }, { nameAr: { equals: nameAr, mode: 'insensitive' } }],
      },
      select: { id: true },
    });
    return found !== null;
  }

  /** The shown template holding a work system's default, other than `exceptId`. */
  findDefault(workSystem: WorkSystem, exceptId: string | null): Promise<{ id: string; nameEn: string; nameAr: string } | null> {
    return this.db.contractTemplate.findFirst({
      where: { defaultForWorkSystem: workSystem, hiddenAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true, nameEn: true, nameAr: true },
    });
  }

  async create(data: {
    nameEn: string;
    nameAr: string;
    defaultForWorkSystem: WorkSystem | null;
    actorId: string | null;
  }): Promise<string> {
    const row = await this.db.contractTemplate.create({
      data: {
        nameEn: data.nameEn,
        nameAr: data.nameAr,
        defaultForWorkSystem: data.defaultForWorkSystem,
        currentVersion: 1,
        createdById: data.actorId,
        updatedById: data.actorId,
      },
      select: { id: true },
    });
    return row.id;
  }

  async update(id: string, data: Prisma.ContractTemplateUncheckedUpdateInput): Promise<void> {
    await this.db.contractTemplate.update({ where: { id }, data });
  }

  async addVersion(data: {
    templateId: string;
    version: number;
    bodyAr: ContractDocument;
    bodyEn: ContractDocument | null;
    usesSalary: boolean;
    fields: string[];
    actorId: string | null;
  }): Promise<void> {
    await this.db.contractTemplateVersion.create({
      data: {
        templateId: data.templateId,
        version: data.version,
        bodyAr: data.bodyAr as unknown as Prisma.InputJsonValue,
        bodyEn: data.bodyEn ? (data.bodyEn as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        hasEnglish: data.bodyEn !== null,
        usesSalary: data.usesSalary,
        fields: data.fields,
        createdById: data.actorId,
      },
    });
  }

  async versionsPage(templateId: string, page: number, limit: number): Promise<{ rows: TemplateVersionSummaryRow[]; total: number }> {
    const where = { templateId };
    const [rows, total] = await Promise.all([
      this.db.contractTemplateVersion.findMany({
        where,
        select: VERSION_SUMMARY_SELECT,
        orderBy: { version: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.contractTemplateVersion.count({ where }),
    ]);
    return { rows, total };
  }

  findVersion(templateId: string, version: number): Promise<TemplateVersionRow | null> {
    return this.db.contractTemplateVersion.findUnique({
      where: { templateId_version: { templateId, version } },
      select: VERSION_SELECT,
    });
  }

  /** The id of a template's version row (a copy points at it). */
  async versionId(templateId: string, version: number): Promise<string | null> {
    const row = await this.db.contractTemplateVersion.findUnique({
      where: { templateId_version: { templateId, version } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  private async withVersions<S extends typeof VERSION_SUMMARY_SELECT | typeof VERSION_SELECT>(
    templates: TemplateRow[],
    select: S,
  ): Promise<Array<{ template: TemplateRow; version: Prisma.ContractTemplateVersionGetPayload<{ select: S }> }>> {
    if (templates.length === 0) return [];
    const withTemplateId: Prisma.ContractTemplateVersionSelect = { ...select, templateId: true };
    const versions = (await this.db.contractTemplateVersion.findMany({
      where: { OR: templates.map((t) => ({ templateId: t.id, version: t.currentVersion })) },
      select: withTemplateId,
    })) as unknown as Array<Prisma.ContractTemplateVersionGetPayload<{ select: S }> & { templateId: string }>;
    const byTemplate = new Map(versions.map((v) => [v.templateId, v]));
    return templates.flatMap((template) => {
      const version = byTemplate.get(template.id);
      return version ? [{ template, version }] : [];
    });
  }
}

/** A unique-index refusal on one of the template indexes, by its name. */
export function uniqueViolationOn(error: unknown): 'name' | 'default' | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
  const target = JSON.stringify(error.meta ?? {});
  if (target.includes('one_default_per_work_system') || target.includes('default_for_work_system')) return 'default';
  if (target.includes('name_en') || target.includes('name_ar')) return 'name';
  return null;
}

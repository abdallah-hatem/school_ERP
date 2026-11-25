import {
  canonicalJson,
  CONTRACT_FIELDS,
  documentUsesSalary,
  fieldsOfDocument,
  type AuditLabel,
  type ContractDocument,
  type ContractFieldKey,
  type ContractTemplate,
  type ContractTemplateSummary,
  type ContractTemplateVersionSummary,
  type ContractTemplateVersion,
} from '@school-erp/shared';
import type {
  TemplateRow,
  TemplateSummaryRow,
  TemplateVersionRow,
  TemplateVersionSummaryRow,
  TemplateWithVersion,
} from './repositories/contract-templates.repository';

const isSalary = (key: ContractFieldKey) => CONTRACT_FIELDS[key].salary;

/** What a version stores beside its texts, worked out on save. */
export function versionFacts(bodyAr: ContractDocument, bodyEn: ContractDocument | null): { usesSalary: boolean; fields: ContractFieldKey[] } {
  const fields = [...new Set([...fieldsOfDocument(bodyAr), ...(bodyEn ? fieldsOfDocument(bodyEn) : [])])];
  return {
    usesSalary: documentUsesSalary(bodyAr, isSalary) || (bodyEn !== null && documentUsesSalary(bodyEn, isSalary)),
    fields,
  };
}

/** Whether a template's text changed (either language): a change is a new version. */
export function textChanged(
  before: { bodyAr: unknown; bodyEn: unknown },
  after: { bodyAr: ContractDocument; bodyEn: ContractDocument | null },
): boolean {
  return canonicalJson(before.bodyAr) !== canonicalJson(after.bodyAr) || canonicalJson(before.bodyEn ?? null) !== canonicalJson(after.bodyEn);
}

export function templateAuditLabel(row: Pick<TemplateRow, 'nameEn' | 'nameAr'>): AuditLabel {
  return { en: row.nameEn, ar: row.nameAr };
}

/** The languages a version has: "AR" or "AR+EN" (the audit entry's "languages" line). */
export function languagesOf(version: Pick<TemplateVersionSummaryRow, 'hasEnglish'>): string {
  return version.hasEnglish ? 'AR+EN' : 'AR';
}

/**
 * What a template's audit entry keeps (spec → Audit): names, default mark, hidden, version and
 * languages — never the texts (the versions table keeps them; an entry doesn't copy 200 KB).
 */
export function templateAuditSnapshot(row: TemplateWithVersion): Record<string, unknown> {
  return {
    nameEn: row.template.nameEn,
    nameAr: row.template.nameAr,
    defaultForWorkSystem: row.template.defaultForWorkSystem,
    hidden: row.template.hiddenAt !== null,
    version: row.template.currentVersion,
    languages: languagesOf(row.version),
  };
}

const person = (user: { id: string; name: string } | null) => (user ? { id: user.id, name: user.name } : null);

export function toSummary({ template, version }: TemplateSummaryRow): ContractTemplateSummary {
  return {
    id: template.id,
    nameEn: template.nameEn,
    nameAr: template.nameAr,
    hasEnglish: version.hasEnglish,
    defaultForWorkSystem: template.defaultForWorkSystem,
    hidden: template.hiddenAt !== null,
    version: template.currentVersion,
    usesSalary: version.usesSalary,
    updatedAt: template.updatedAt.toISOString(),
    updatedBy: person(template.updatedBy),
  };
}

export function toTemplate(row: TemplateWithVersion): ContractTemplate {
  return {
    ...toSummary(row),
    bodyAr: row.version.bodyAr as unknown as ContractDocument,
    bodyEn: (row.version.bodyEn as unknown as ContractDocument | null) ?? null,
    createdAt: row.template.createdAt.toISOString(),
    createdBy: person(row.template.createdBy),
  };
}

export function toVersionSummary(v: TemplateVersionSummaryRow): ContractTemplateVersionSummary {
  return {
    version: v.version,
    hasEnglish: v.hasEnglish,
    usesSalary: v.usesSalary,
    createdAt: v.createdAt.toISOString(),
    createdBy: person(v.createdBy),
  };
}

export function toVersion(v: TemplateVersionRow): ContractTemplateVersion {
  return {
    ...toVersionSummary(v),
    bodyAr: v.bodyAr as unknown as ContractDocument,
    bodyEn: (v.bodyEn as unknown as ContractDocument | null) ?? null,
  };
}

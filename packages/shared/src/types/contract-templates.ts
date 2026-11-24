import type { ContractFieldKey, ContractFieldValues, ContractLanguage } from '../contract-document/fields';
import type { ContractDocument } from '../contract-document/schema';
import type { WorkSystem } from '../enums';
import type { IsoDate, IsoDateTime, PaginationQuery, Uuid } from './common';
import type { ContractCopy, ContractCopyOutput, ContractPersonRef } from './contract-copies';
import type { ContractPhase, ContractStatus } from './contracts';

/*
 * Contract templates and printed copies (spec docs/specs/2026-11-24-contract-templates.md, §3 →
 * Contracts → "Contract templates and printed copies"). Templates are never deleted, only hidden;
 * each text change is a new version; a printed copy keeps its version, values and PDF for good.
 */

/** One row of Settings → HR → Contract templates. */
export interface ContractTemplateSummary {
  id: Uuid;
  nameEn: string;
  nameAr: string;
  /** Arabic always; English when the current version has English text. */
  hasEnglish: boolean;
  defaultForWorkSystem: WorkSystem | null;
  hidden: boolean;
  /** The current version (v1, v2, …). */
  version: number;
  /** The current version uses a salary field. */
  usesSalary: boolean;
  updatedAt: IsoDateTime;
  updatedBy: ContractPersonRef | null;
}

/** `GET /hr/contract-templates/:id` — the template with its current version's texts. */
export interface ContractTemplate extends ContractTemplateSummary {
  bodyAr: ContractDocument;
  bodyEn: ContractDocument | null;
  createdAt: IsoDateTime;
  createdBy: ContractPersonRef | null;
}

/** `GET /hr/contract-templates` — server-paged and searched (name in either language). */
export interface ContractTemplatesQuery extends PaginationQuery {
  search?: string;
  /** `true`: the hidden ones too ("Show hidden"). */
  hidden?: boolean;
}

/** `POST /hr/contract-templates`. */
export interface CreateContractTemplateRequest {
  nameEn: string;
  nameAr: string;
  defaultForWorkSystem: WorkSystem | null;
  bodyAr: ContractDocument;
  bodyEn: ContractDocument | null;
}

/** `PUT /hr/contract-templates/:id` — `baseVersion`: the version the editor loaded (409 `TEMPLATE_CHANGED`). */
export interface UpdateContractTemplateRequest extends CreateContractTemplateRequest {
  baseVersion: number;
}

/** A save's answer: the template, and the one that lost the work system's default mark, if any. */
export interface SaveContractTemplateResponse {
  template: ContractTemplate;
  tookDefaultFrom: { id: Uuid; nameEn: string; nameAr: string } | null;
}

/** `GET /hr/contract-templates/:id/versions` — one version (insert-only). */
export interface ContractTemplateVersionSummary {
  version: number;
  hasEnglish: boolean;
  usesSalary: boolean;
  createdAt: IsoDateTime;
  createdBy: ContractPersonRef | null;
}

/** `GET /hr/contract-templates/:id/versions/:version`. */
export interface ContractTemplateVersion extends ContractTemplateVersionSummary {
  bodyAr: ContractDocument;
  bodyEn: ContractDocument | null;
}

/** The person a preview or a copy is about. */
export interface ContractPrintEmployee {
  id: Uuid;
  code: string;
  nameEn: string;
  nameAr: string;
}

/**
 * `GET /hr/contract-templates/:id/preview?employeeId=&language=` — "Preview with an employee":
 * their current contract's values, read-only, nothing kept. Salary fields the reader may not see are
 * listed in `hidden` (their values null).
 */
export interface ContractTemplatePreview {
  employee: ContractPrintEmployee;
  contract: { id: Uuid; startsOn: IsoDate; endsOn: IsoDate } | null;
  language: ContractLanguage;
  values: ContractFieldValues;
  hidden: ContractFieldKey[];
}

/** `GET /hr/contracts/:id/print-templates` — the print picker: shown templates only. */
export interface ContractPrintTemplateOption {
  id: Uuid;
  nameEn: string;
  nameAr: string;
  version: number;
  hasEnglish: boolean;
  usesSalary: boolean;
  /** The default for this employee's work system (preselected). */
  isDefault: boolean;
  /** Uses a salary field and the printer may not see this employee's salary ("Needs access to salaries"). */
  salaryBlocked: boolean;
}

/**
 * `GET /hr/contracts/:id/print?templateId=&language=` — what the dialog shows: the template version's
 * text in that language, the values filled now, what prints empty or is left out, the hash the copy
 * must be made with, and the contract's earlier copies.
 */
export interface ContractPrintPreview {
  contract: {
    id: Uuid;
    startsOn: IsoDate;
    endsOn: IsoDate;
    status: ContractStatus;
    phase: ContractPhase;
    /** The contract year (`2026` = 2026/27). */
    year: number;
    /** Set when its last day passed: "This contract ended on … — the values are today's". */
    endedOn: IsoDate | null;
  };
  employee: ContractPrintEmployee;
  template: { id: Uuid; nameEn: string; nameAr: string; version: number; hasEnglish: boolean };
  language: ContractLanguage;
  /** The template version's text in `language`. */
  document: ContractDocument;
  values: ContractFieldValues;
  /** Fields of the text printing empty (a dotted line), outside optional phrases. */
  emptyFields: ContractFieldKey[];
  /** The optional phrases left out, each with its empty fields. */
  phrasesLeftOut: ContractFieldKey[][];
  /** The school's logo for the letterhead (`/files/logo/…`), or null. */
  logoUrl: string | null;
  /** Sent back with the copy: a change in between → 409 `VALUES_CHANGED`. */
  valuesHash: string;
  copies: ContractCopy[];
}

/** `POST /hr/contracts/:id/copies`. */
export interface CreateContractCopyRequest {
  templateId: Uuid;
  templateVersion: number;
  language: ContractLanguage;
  valuesHash: string;
  /** "Edit text": this copy's own text (values stay chips); absent → the template's. */
  bodyEdited?: ContractDocument;
  output: ContractCopyOutput;
}

/** `GET /hr/contracts/:id/copies` and inside `GET /hr/employees/:id/contracts` (newest first). */
export type ContractCopies = ContractCopy[];

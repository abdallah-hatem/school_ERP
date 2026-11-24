'use server';

import type {
  Contract,
  ContractCopy,
  ContractFileUpload,
  ContractLanguage,
  ContractPrintPreview,
  ContractPrintTemplateOption,
  CreateContractCopyRequest,
  ContractsPage,
  EarlyTerminationRequest,
  EmployeeContractsQuery,
  EndContractRequest,
  ListContractsQuery,
  NewContractRequest,
  NotRenewContractRequest,
  Uuid,
} from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';
import type { DownloadedFile } from '@/lib/types';

/*
 * Contracts screens' endpoints (spec docs/specs/2026-11-24-contracts.md → API). Reads are tagged;
 * every write revalidates the contracts tag and the employees' (the record's current contract, the
 * profile's contract line and a deactivation change what they show).
 */

const CONTRACTS_TAG = 'hr-contracts';
const EMPLOYEES_TAG = 'hr-employees';
const WRITE_TAGS = [CONTRACTS_TAG, EMPLOYEES_TAG];

const page = (n: number | undefined) => (n ? String(n) : undefined);

/**
 * `GET /hr/contracts?year&decision&stageId&search&page&limit` — one contract year's renewal list,
 * paged, filtered, searched and ordered ("needs action first") by the API, with the five tiles'
 * totals and the year's school calendar.
 */
export async function GET_CONTRACTS(query: ListContractsQuery = {}) {
  const response = await apiFetch<ContractsPage>('/hr/contracts', {
    method: 'GET',
    params: {
      year: query.year ? String(query.year) : undefined,
      decision: query.decision,
      stageId: query.stageId,
      search: query.search || undefined,
      page: page(query.page),
      limit: page(query.limit),
    },
    next: { tags: [CONTRACTS_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `GET /hr/employees/:id/contracts?page&limit` — one employee's contracts, newest first. 404 outside scope. */
export async function GET_EMPLOYEE_CONTRACTS(employeeId: Uuid, query: EmployeeContractsQuery = {}) {
  const response = await apiFetch<Contract[]>(`/hr/employees/${encodeURIComponent(employeeId)}/contracts`, {
    method: 'GET',
    params: { page: page(query.page), limit: page(query.limit) },
    next: { tags: [CONTRACTS_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}

/**
 * `POST /hr/contracts/renew` — all or nothing: a 409 `CONTRACTS_NOT_RENEWABLE` lists every refused
 * row (`data`: `contractId` + `code`); a single id answers with its own code.
 */
export async function RENEW_CONTRACTS(contractIds: Uuid[]) {
  const response = await apiFetch<Contract[]>('/hr/contracts/renew', {
    method: 'POST',
    body: { contractIds },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

/** `POST /hr/contracts/:id/not-renewed` — the school's decision, or the employee's notice (`receivedOn`). */
export async function NOT_RENEW_CONTRACT(id: Uuid, body: NotRenewContractRequest) {
  const response = await apiFetch<Contract>(`/hr/contracts/${encodeURIComponent(id)}/not-renewed`, {
    method: 'POST',
    body: { ...body },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

/** `POST /hr/contracts/:id/not-renewed/undo` — the school changed its mind, before the end; the reason is required. */
/** `POST /hr/contracts/:id/cancel` — an upcoming contract that isn't a renewal, with a reason. */
export async function CANCEL_CONTRACT(id: Uuid, reason: string) {
  const response = await apiFetch<Contract>(`/hr/contracts/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: { reason },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

export async function UNDO_NOT_RENEW(id: Uuid, reason: string) {
  const response = await apiFetch<Contract>(`/hr/contracts/${encodeURIComponent(id)}/not-renewed/undo`, {
    method: 'POST',
    body: { reason },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

/**
 * `POST /hr/employees/:id/contracts` — a new one-year contract for an active employee with no active
 * one (a reactivated employee, or after the school's not-renewing); `startsOn` defaults to 1 June of
 * the current contract year.
 */
export async function CREATE_EMPLOYEE_CONTRACT(employeeId: Uuid, body: NewContractRequest) {
  const response = await apiFetch<Contract>(`/hr/employees/${encodeURIComponent(employeeId)}/contracts`, {
    method: 'POST',
    body: { ...body },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

/** `POST /hr/contracts/:id/notice/withdraw` — while the contract still runs; the reason is required. */
export async function WITHDRAW_NOTICE(id: Uuid, reason: string) {
  const response = await apiFetch<Contract>(`/hr/contracts/${encodeURIComponent(id)}/notice/withdraw`, {
    method: 'POST',
    body: { reason },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

/** `POST /hr/contracts/:id/early-termination` — records the employee's request. */
export async function REQUEST_EARLY_TERMINATION(id: Uuid, body: EarlyTerminationRequest) {
  const response = await apiFetch<Contract>(`/hr/contracts/${encodeURIComponent(id)}/early-termination`, {
    method: 'POST',
    body: { ...body },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

/** `POST /hr/contracts/:id/early-termination/approve` — the contract ends on the last day of term 1. */
export async function APPROVE_EARLY_TERMINATION(id: Uuid) {
  const response = await apiFetch<Contract>(`/hr/contracts/${encodeURIComponent(id)}/early-termination/approve`, {
    method: 'POST',
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

/** `POST /hr/contracts/:id/early-termination/reject` — with the required reason. */
export async function REJECT_EARLY_TERMINATION(id: Uuid, reason: string) {
  const response = await apiFetch<Contract>(`/hr/contracts/${encodeURIComponent(id)}/early-termination/reject`, {
    method: 'POST',
    body: { reason },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

/**
 * `POST /hr/contracts/:id/end` — another reason (Article 148, resignation by agreement, death, other).
 * On a renewed contract the next one is cancelled with it.
 */
export async function END_CONTRACT(id: Uuid, body: EndContractRequest) {
  const response = await apiFetch<Contract>(`/hr/contracts/${encodeURIComponent(id)}/end`, {
    method: 'POST',
    body: { ...body },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

/** `POST /hr/contracts/deactivate` — the "To deactivate" employees (`hr.employees.change_status`). */
export async function DEACTIVATE_CONTRACTS(contractIds: Uuid[]) {
  const response = await apiFetch<{ deactivated: number }>('/hr/contracts/deactivate', {
    method: 'POST',
    body: { contractIds },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response });
}

/**
 * `POST /hr/contracts/:id/files` — multipart `file` (PDF / PNG / JPG / WebP, ≤ 5 MB — checked on the
 * client too). Answers where it is stored; the action that follows passes that `fileUrl`.
 */
export async function UPLOAD_CONTRACT_FILE(id: Uuid, form: FormData) {
  const response = await apiFetch<ContractFileUpload>(`/hr/contracts/${encodeURIComponent(id)}/files`, {
    method: 'POST',
    body: form,
  });
  return handleResponse({ response, showErrorToast: false });
}

// ── Printing (contract templates spec → Printing, Printed copies) ───────────────────────────────

/**
 * `GET /hr/contracts/:id/print-templates?search&page&limit` — the print picker: the shown
 * templates, searched by the API; `isDefault` for the employee's work system, `salaryBlocked`
 * when the printer may not see this employee's salary.
 */
export async function GET_PRINT_TEMPLATES(contractId: Uuid, query: { search?: string; page?: number; limit?: number } = {}) {
  const response = await apiFetch<ContractPrintTemplateOption[]>(`/hr/contracts/${encodeURIComponent(contractId)}/print-templates`, {
    method: 'GET',
    params: { search: query.search || undefined, page: page(query.page), limit: page(query.limit) },
    cache: 'no-store',
  });
  return handleResponse({ response, showErrorToast: false });
}

/**
 * `GET /hr/contracts/:id/print?templateId&language` — the text, today's values, what prints empty
 * or is left out, the hash the copy must carry, and the contract's earlier copies. Refusals:
 * `OWN_CONTRACT`, `CONTRACT_CANCELLED`, `SALARY_NOT_VISIBLE`, `TEMPLATE_HIDDEN`, `NO_ENGLISH_TEXT`.
 */
export async function GET_CONTRACT_PRINT(contractId: Uuid, templateId: Uuid, language: ContractLanguage) {
  const response = await apiFetch<ContractPrintPreview>(`/hr/contracts/${encodeURIComponent(contractId)}/print`, {
    method: 'GET',
    params: { templateId, language },
    cache: 'no-store',
  });
  return handleResponse({ response, showErrorToast: false });
}

/**
 * `POST /hr/contracts/:id/copies` — renders the PDF and keeps the copy. 409 `VALUES_CHANGED` /
 * `TEMPLATE_CHANGED` when the preview is stale; 503 `PDF_RENDER_FAILED`.
 */
export async function CREATE_CONTRACT_COPY(contractId: Uuid, body: CreateContractCopyRequest) {
  const response = await apiFetch<ContractCopy>(`/hr/contracts/${encodeURIComponent(contractId)}/copies`, {
    method: 'POST',
    body: { ...body },
    revalidateTags: WRITE_TAGS,
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `GET /hr/contracts/:id/copies?page&limit` — the contract's printed copies, newest first. */
export async function GET_CONTRACT_COPIES(contractId: Uuid, query: { page?: number; limit?: number } = {}) {
  const response = await apiFetch<ContractCopy[]>(`/hr/contracts/${encodeURIComponent(contractId)}/copies`, {
    method: 'GET',
    params: { page: page(query.page), limit: page(query.limit) },
    next: { tags: [CONTRACTS_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}

const COPY_FILES = '/files/contract-copies/';

/**
 * A printed copy's PDF, as a download (base64 across the action): to print it from a hidden frame
 * or hand it to the phone's share sheet. Only a copy's own file (`/files/contract-copies/…`);
 * the API records the opening like any other.
 */
export async function GET_CONTRACT_COPY_FILE(fileUrl: string) {
  if (!fileUrl.startsWith(COPY_FILES) || fileUrl.includes('..') || fileUrl.includes('?')) {
    return { success: false as const, status: 400, message: 'Not a contract copy' };
  }
  return apiFetch<DownloadedFile>(fileUrl, { method: 'GET', responseType: 'file', cache: 'no-store' });
}

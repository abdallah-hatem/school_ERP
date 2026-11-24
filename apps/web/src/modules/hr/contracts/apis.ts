'use server';

import type {
  Contract,
  ContractFileUpload,
  ContractsPage,
  EarlyTerminationRequest,
  EmployeeContractsQuery,
  EndContractRequest,
  ListContractsQuery,
  NotRenewContractRequest,
  SchoolCalendar,
  Uuid,
} from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

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

/** `POST /hr/contracts/:id/end` — another reason (Article 148, resignation by agreement, death, other). */
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

/**
 * `GET /hr/settings/school-calendar/:year` — the term dates a contract's notice window and early
 * termination read (`calendar` null: not set). The decision sheet asks for it when the list didn't
 * carry it (the employee's tab, a mid-year contract).
 */
export async function GET_SCHOOL_CALENDAR(year: number) {
  const response = await apiFetch<SchoolCalendar>(`/hr/settings/school-calendar/${encodeURIComponent(String(year))}`, {
    method: 'GET',
    next: { tags: ['hr-school-calendar'] },
  });
  return handleResponse({ response, showErrorToast: false });
}

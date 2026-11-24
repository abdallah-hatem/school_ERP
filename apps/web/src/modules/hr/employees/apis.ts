'use server';

import type {
  CreateEmployeeRequest,
  Department,
  Employee,
  EmployeeSummary,
  EmployeeGrade,
  JobTitle,
  ListEmployeesQuery,
  ListStagesQuery,
  Stage,
  UpdateEmployeeRequest,
  Uuid,
} from '@school-erp/shared';
import { EmployeeStatus, PAGINATION } from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/*
 * Employees screens' endpoints (contract → "Employees — hr", "HR lists — hr", stages in core).
 * Reads are tagged; every write revalidates the list and the one employee it changed.
 */

const EMPLOYEES_TAG = 'hr-employees';
const employeeTag = (id: Uuid) => `hr-employee-${id}`;
const LISTS_TAG = 'hr-lists';

function toParams(query: ListEmployeesQuery): Record<string, string | undefined> {
  return {
    page: query.page ? String(query.page) : undefined,
    limit: query.limit ? String(query.limit) : undefined,
    search: query.search || undefined,
    departmentId: query.departmentId,
    stageId: query.stageId,
    status: query.status,
    workSystem: query.workSystem,
    managesPeople: query.managesPeople === undefined ? undefined : String(query.managesPeople),
    excludeId: query.excludeId,
  };
}

/** `GET /hr/employees` — paginated summaries with the list filters. */
export async function GET_EMPLOYEES(query: ListEmployeesQuery = {}) {
  const response = await apiFetch<EmployeeSummary[]>('/hr/employees', {
    method: 'GET',
    params: toParams(query),
    next: { tags: [EMPLOYEES_TAG] },
  });
  return handleResponse({ response });
}

/**
 * Candidates for the direct-manager picker (§3): active employees whose job title manages people,
 * never `selfId` (the employee being edited), one page for the typed name or code — the API
 * searches them. The form keeps the employee's current manager even if they no longer qualify.
 */
export async function GET_MANAGER_OPTIONS(selfId?: Uuid, query: { search?: string; limit?: number } = {}) {
  return GET_EMPLOYEES({
    status: EmployeeStatus.ACTIVE,
    managesPeople: true,
    excludeId: selfId,
    search: query.search || undefined,
    limit: query.limit ?? PAGINATION.defaultLimit,
  });
}

/** `GET /hr/employees/:id` — the full record with its list items and manager. */
export async function GET_EMPLOYEE(id: Uuid) {
  const response = await apiFetch<Employee>(`/hr/employees/${encodeURIComponent(id)}`, {
    method: 'GET',
    next: { tags: [EMPLOYEES_TAG, employeeTag(id)] },
  });
  return handleResponse({ response });
}

/** `POST /hr/employees` — the code is assigned by the server. */
export async function CREATE_EMPLOYEE(body: CreateEmployeeRequest) {
  const response = await apiFetch<Employee>('/hr/employees', {
    method: 'POST',
    body: { ...body },
    revalidateTags: [EMPLOYEES_TAG],
  });
  return handleResponse({ response });
}

/** `PATCH /hr/employees/:id` — only the fields that changed. */
export async function UPDATE_EMPLOYEE(id: Uuid, body: UpdateEmployeeRequest) {
  const response = await apiFetch<Employee>(`/hr/employees/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { ...body },
    revalidateTags: [EMPLOYEES_TAG, employeeTag(id)],
  });
  return handleResponse({ response });
}

/**
 * The tags whose screens show the employee's photo: the list, the employee, and the penalties
 * list (its rows show the avatar).
 */
const photoTags = (id: Uuid) => [EMPLOYEES_TAG, employeeTag(id), 'hr-penalties'];

/** `POST /hr/employees/:id/photo` — multipart `file` (PNG / JPG / WebP, ≤ 2 MB — checked on the client too). */
export async function UPLOAD_EMPLOYEE_PHOTO(id: Uuid, form: FormData) {
  const response = await apiFetch<Employee>(`/hr/employees/${encodeURIComponent(id)}/photo`, {
    method: 'POST',
    body: form,
    revalidateTags: photoTags(id),
  });
  return handleResponse({ response });
}

/** `DELETE /hr/employees/:id/photo` — back to the silhouette. */
export async function REMOVE_EMPLOYEE_PHOTO(id: Uuid) {
  const response = await apiFetch<Employee>(`/hr/employees/${encodeURIComponent(id)}/photo`, {
    method: 'DELETE',
    revalidateTags: photoTags(id),
  });
  return handleResponse({ response });
}

/** `POST /hr/employees/:id/deactivate` — idempotent; the record and its history are kept. */
export async function DEACTIVATE_EMPLOYEE(id: Uuid) {
  const response = await apiFetch<Employee>(`/hr/employees/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
    revalidateTags: [EMPLOYEES_TAG, employeeTag(id)],
  });
  return handleResponse({ response });
}

/** `POST /hr/employees/:id/reactivate` — idempotent. */
export async function REACTIVATE_EMPLOYEE(id: Uuid) {
  const response = await apiFetch<Employee>(`/hr/employees/${encodeURIComponent(id)}/reactivate`, {
    method: 'POST',
    revalidateTags: [EMPLOYEES_TAG, employeeTag(id)],
  });
  return handleResponse({ response });
}

/**
 * A list's query: `page`, `limit`, `search` (either name) and `ids` (a picker's chosen ones) ask the
 * API for one page with `meta` — pickers search there, never in the browser. Hidden items only
 * with `includeHidden` (filters show every one: hidden items can still have employees).
 */
function listParams(query: ListStagesQuery): Record<string, string | undefined> {
  return {
    includeHidden: query.includeHidden ? 'true' : undefined,
    page: query.page ? String(query.page) : undefined,
    limit: query.limit ? String(query.limit) : undefined,
    search: query.search || undefined,
    ids: query.ids?.length ? query.ids.join(',') : undefined,
    excludeIds: query.excludeIds?.length ? query.excludeIds.join(',') : undefined,
  };
}

/** `GET /hr/departments` — one page (a picker's search), visible ones unless `includeHidden`. */
export async function GET_DEPARTMENTS(query: ListStagesQuery = {}) {
  const response = await apiFetch<Department[]>('/hr/departments', {
    method: 'GET',
    params: listParams({ limit: PAGINATION.defaultLimit, ...query }),
    next: { tags: [LISTS_TAG] },
  });
  return handleResponse({ response });
}

/** `GET /hr/job-titles` — one page, as departments. */
export async function GET_JOB_TITLES(query: ListStagesQuery = {}) {
  const response = await apiFetch<JobTitle[]>('/hr/job-titles', {
    method: 'GET',
    params: listParams({ limit: PAGINATION.defaultLimit, ...query }),
    next: { tags: [LISTS_TAG] },
  });
  return handleResponse({ response });
}

/** `GET /hr/employee-grades` (§3, owner 2026-11-24) — one page, as departments. */
export async function GET_EMPLOYEE_GRADES(query: ListStagesQuery = {}) {
  const response = await apiFetch<EmployeeGrade[]>('/hr/employee-grades', {
    method: 'GET',
    params: listParams({ limit: PAGINATION.defaultLimit, ...query }),
    next: { tags: [LISTS_TAG] },
  });
  return handleResponse({ response });
}

/** `GET /stages` (core school structure) — one page, as departments. */
export async function GET_STAGES(query: ListStagesQuery = {}) {
  const response = await apiFetch<Stage[]>('/stages', {
    method: 'GET',
    params: listParams({ limit: PAGINATION.defaultLimit, ...query }),
    next: { tags: [LISTS_TAG] },
  });
  return handleResponse({ response });
}

/**
 * Every stage, hidden ones too, in the school's order — only for the stage colour bands on the
 * employee cards (a colour per place in the order), never as a list or a picker's choices.
 */
export async function GET_STAGE_ORDER() {
  const response = await apiFetch<Stage[]>('/stages', {
    method: 'GET',
    params: { includeHidden: 'true' },
    next: { tags: [LISTS_TAG] },
  });
  return handleResponse({ response });
}

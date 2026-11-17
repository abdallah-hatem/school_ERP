'use server';

import type {
  CreateEmployeeRequest,
  Department,
  Employee,
  EmployeeSummary,
  JobTitle,
  ListEmployeesQuery,
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
 * Candidates for the direct-manager picker: active employees only (§3), one page of the maximum
 * size. The form still drops the employee being edited.
 */
export async function GET_MANAGER_OPTIONS() {
  return GET_EMPLOYEES({ status: EmployeeStatus.ACTIVE, limit: PAGINATION.maxLimit });
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

const listParams = (includeHidden: boolean) => (includeHidden ? { includeHidden: 'true' } : undefined);

/** `GET /hr/departments` — visible ones unless `includeHidden` (filters show every one). */
export async function GET_DEPARTMENTS(includeHidden = false) {
  const response = await apiFetch<Department[]>('/hr/departments', {
    method: 'GET',
    params: listParams(includeHidden),
    next: { tags: [LISTS_TAG] },
  });
  return handleResponse({ response });
}

/** `GET /hr/job-titles`. */
export async function GET_JOB_TITLES(includeHidden = false) {
  const response = await apiFetch<JobTitle[]>('/hr/job-titles', {
    method: 'GET',
    params: listParams(includeHidden),
    next: { tags: [LISTS_TAG] },
  });
  return handleResponse({ response });
}

/** `GET /stages` (core school structure). */
export async function GET_STAGES(includeHidden = false) {
  const response = await apiFetch<Stage[]>('/stages', {
    method: 'GET',
    params: listParams(includeHidden),
    next: { tags: [LISTS_TAG] },
  });
  return handleResponse({ response });
}

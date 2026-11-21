'use server';

import type {
  AccountingSettings,
  UpdateAccountingSettingsRequest,
  CreateJobTitleRequest,
  CreatePenaltyGroupRequest,
  CreateViolationRequest,
  HrSettings,
  JobTitle,
  ListItem,
  PenaltyGroup,
  SchoolSettings,
  UpdateHrSettingsRequest,
  UpdateJobTitleRequest,
  UpdatePenaltyGroupRequest,
  UpdateSchoolSettingsRequest,
  UpdateViolationRequest,
  UploadLogoResponse,
  Violation,
} from '@school-erp/shared';
import { SCHOOL_SETTINGS_TAG } from '@/core/settings/tags';
import { PAGINATION } from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/*
 * Settings screen endpoints (contract: "School settings — core/settings", "School structure",
 * "HR lists", "HR rule settings", "Penalty catalogue"). Client components call them through
 * `callApi`.
 */

const HR_SETTINGS_TAG = 'hr-settings';
/**
 * The lateness list and the payroll runs carry the HR rules they use (their screens need no
 * `hr.settings.view`), so changing the rules refreshes them too.
 */
const HR_RULE_READERS_TAGS = ['hr-lateness', 'hr-payroll-runs'];
const ACCOUNTING_SETTINGS_TAG = 'accounting-settings';
const CATALOGUE_TAG = 'penalty-catalogue';

/** Stages, departments and job titles share one shape and one set of routes. */
export type ListKind = 'stages' | 'departments' | 'jobTitles';
/** A list item as the Settings screen holds it: job titles also carry `managesPeople` (§3). */
export type ManagedListItem = ListItem & Partial<Pick<JobTitle, 'managesPeople'>>;
const LIST_ROUTES: Record<ListKind, { path: string; tag: string }> = {
  stages: { path: '/stages', tag: 'stages' },
  departments: { path: '/hr/departments', tag: 'departments' },
  jobTitles: { path: '/hr/job-titles', tag: 'job-titles' },
};

// ── School ───────────────────────────────────────────────────────────────────

export async function GET_SCHOOL_SETTINGS_FOR_EDIT() {
  const res = await apiFetch<SchoolSettings>('/settings/school', { cache: 'no-store' });
  return handleResponse({ response: res });
}

export async function UPDATE_SCHOOL_SETTINGS(data: UpdateSchoolSettingsRequest) {
  const res = await apiFetch<SchoolSettings>('/settings/school', {
    method: 'PATCH',
    body: { ...data },
    revalidateTags: [SCHOOL_SETTINGS_TAG],
  });
  return handleResponse({ response: res });
}

/** Multipart `file` (PNG / JPG / SVG, ≤ 2 MB — checked on the client too). */
export async function UPLOAD_SCHOOL_LOGO(form: FormData) {
  const res = await apiFetch<UploadLogoResponse>('/settings/school/logo', {
    method: 'POST',
    body: form,
    revalidateTags: [SCHOOL_SETTINGS_TAG],
  });
  return handleResponse({ response: res });
}

// ── Lists: stages (core), departments and job titles (hr) ────────────────────

/** One page of a list, hidden items too (by order, then name) — the API pages it, with `meta`. */
export async function GET_LIST_ITEMS(kind: ListKind, query: { page?: number; limit?: number } = {}) {
  const res = await apiFetch<ManagedListItem[]>(LIST_ROUTES[kind].path, {
    params: {
      includeHidden: 'true',
      page: String(query.page ?? PAGINATION.defaultPage),
      limit: String(query.limit ?? PAGINATION.defaultLimit),
    },
    cache: 'no-store',
  });
  return handleResponse({ response: res });
}

/** `managesPeople` is for job titles only — the other lists refuse it. */
export async function CREATE_LIST_ITEM(kind: ListKind, data: CreateJobTitleRequest) {
  const res = await apiFetch<ManagedListItem>(LIST_ROUTES[kind].path, {
    method: 'POST',
    body: { ...data },
    revalidateTags: [LIST_ROUTES[kind].tag],
  });
  return handleResponse({ response: res });
}

export async function UPDATE_LIST_ITEM(kind: ListKind, id: string, data: UpdateJobTitleRequest) {
  const res = await apiFetch<ManagedListItem>(`${LIST_ROUTES[kind].path}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { ...data },
    revalidateTags: [LIST_ROUTES[kind].tag],
  });
  return handleResponse({ response: res });
}

// ── HR rules ─────────────────────────────────────────────────────────────────

export async function GET_HR_SETTINGS() {
  const res = await apiFetch<HrSettings>('/hr/settings', { cache: 'no-store' });
  return handleResponse({ response: res });
}

export async function UPDATE_HR_SETTINGS(data: UpdateHrSettingsRequest) {
  const res = await apiFetch<HrSettings>('/hr/settings', {
    method: 'PATCH',
    body: { ...data },
    revalidateTags: [HR_SETTINGS_TAG, ...HR_RULE_READERS_TAGS],
  });
  return handleResponse({ response: res });
}

// ── Accounting rules (§10) ───────────────────────────────────────────────────

export async function GET_ACCOUNTING_SETTINGS() {
  const res = await apiFetch<AccountingSettings>('/accounting/settings', { cache: 'no-store' });
  return handleResponse({ response: res });
}

export async function UPDATE_ACCOUNTING_SETTINGS(data: UpdateAccountingSettingsRequest) {
  const res = await apiFetch<AccountingSettings>('/accounting/settings', {
    method: 'PATCH',
    body: { ...data },
    revalidateTags: [ACCOUNTING_SETTINGS_TAG],
  });
  return handleResponse({ response: res });
}

// ── Penalty catalogue ────────────────────────────────────────────────────────

/**
 * `GET /hr/penalty-groups?search` — the catalogue; with `search` the API keeps the groups whose
 * name matches (whole) or that hold matching violations (only those), each with its `match`.
 */
export async function GET_PENALTY_GROUPS(query: { search?: string } = {}) {
  const res = await apiFetch<PenaltyGroup[]>('/hr/penalty-groups', {
    params: { search: query.search || undefined },
    cache: 'no-store',
  });
  return handleResponse({ response: res });
}

export async function CREATE_PENALTY_GROUP(data: CreatePenaltyGroupRequest) {
  const res = await apiFetch<PenaltyGroup>('/hr/penalty-groups', {
    method: 'POST',
    body: { ...data },
    revalidateTags: [CATALOGUE_TAG],
  });
  return handleResponse({ response: res });
}

export async function UPDATE_PENALTY_GROUP(id: string, data: UpdatePenaltyGroupRequest) {
  const res = await apiFetch<PenaltyGroup>(`/hr/penalty-groups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { ...data },
    revalidateTags: [CATALOGUE_TAG],
  });
  return handleResponse({ response: res });
}

export async function CREATE_VIOLATION(groupId: string, data: CreateViolationRequest) {
  const res = await apiFetch<Violation>(`/hr/penalty-groups/${encodeURIComponent(groupId)}/violations`, {
    method: 'POST',
    body: { ...data },
    revalidateTags: [CATALOGUE_TAG],
  });
  return handleResponse({ response: res });
}

export async function UPDATE_VIOLATION(id: string, data: UpdateViolationRequest) {
  const res = await apiFetch<Violation>(`/hr/violations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { ...data },
    revalidateTags: [CATALOGUE_TAG],
  });
  return handleResponse({ response: res });
}

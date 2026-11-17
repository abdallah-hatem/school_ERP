'use server';

import type {
  CreateListItemRequest,
  CreatePenaltyGroupRequest,
  CreateViolationRequest,
  HrSettings,
  ListItem,
  PenaltyGroup,
  SchoolSettings,
  UpdateHrSettingsRequest,
  UpdateListItemRequest,
  UpdatePenaltyGroupRequest,
  UpdateSchoolSettingsRequest,
  UpdateViolationRequest,
  UploadLogoResponse,
  Violation,
} from '@school-erp/shared';
import { SCHOOL_SETTINGS_TAG } from '@/core/settings/tags';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/*
 * Settings screen endpoints (contract: "School settings — core/settings", "School structure",
 * "HR lists", "HR rule settings", "Penalty catalogue"). Client components call them through
 * `callApi`.
 */

const HR_SETTINGS_TAG = 'hr-settings';
const CATALOGUE_TAG = 'penalty-catalogue';

/** Stages, departments and job titles share one shape and one set of routes. */
export type ListKind = 'stages' | 'departments' | 'jobTitles';
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

export async function GET_LIST_ITEMS(kind: ListKind) {
  const res = await apiFetch<ListItem[]>(LIST_ROUTES[kind].path, {
    params: { includeHidden: 'true' },
    cache: 'no-store',
  });
  return handleResponse({ response: res });
}

export async function CREATE_LIST_ITEM(kind: ListKind, data: CreateListItemRequest) {
  const res = await apiFetch<ListItem>(LIST_ROUTES[kind].path, {
    method: 'POST',
    body: { ...data },
    revalidateTags: [LIST_ROUTES[kind].tag],
  });
  return handleResponse({ response: res });
}

export async function UPDATE_LIST_ITEM(kind: ListKind, id: string, data: UpdateListItemRequest) {
  const res = await apiFetch<ListItem>(`${LIST_ROUTES[kind].path}/${encodeURIComponent(id)}`, {
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
    revalidateTags: [HR_SETTINGS_TAG],
  });
  return handleResponse({ response: res });
}

// ── Penalty catalogue ────────────────────────────────────────────────────────

export async function GET_PENALTY_GROUPS() {
  const res = await apiFetch<PenaltyGroup[]>('/hr/penalty-groups', { cache: 'no-store' });
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

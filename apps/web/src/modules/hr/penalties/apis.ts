'use server';

import type {
  ApprovePenaltyRequest,
  CreatePenaltyRequest,
  ListPenaltiesQuery,
  PenaltyEmployeeStages,
  PenaltyGroup,
  PenaltyPreview,
  PenaltyPreviewQuery,
  PenaltyRecord,
  PenaltyRecountAcknowledgement,
  Uuid,
} from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/*
 * Penalties screens' endpoints (contract → "Penalty records — hr", and the catalogue's
 * `GET /hr/penalty-groups` for the violation picker). Every write revalidates the records tag; the
 * dashboard and payroll read penalties too, so they share it.
 */

const PENALTIES_TAG = 'hr-penalties';
/** The settings screen (T10) revalidates this when the catalogue changes. */
const CATALOGUE_TAG = 'hr-penalty-catalogue';

/** `GET /hr/penalties` — newest first, filtered by month, status, employee and search. */
export async function GET_PENALTIES(query: ListPenaltiesQuery = {}) {
  const response = await apiFetch<PenaltyRecord[]>('/hr/penalties', {
    method: 'GET',
    params: {
      page: query.page ? String(query.page) : undefined,
      limit: query.limit ? String(query.limit) : undefined,
      search: query.search || undefined,
      employeeId: query.employeeId,
      month: query.month,
      status: query.status,
      stageId: query.stageId,
    },
    next: { tags: [PENALTIES_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}

/**
 * `GET /hr/penalties/:id` — one record (a notification's link, `?penalty=<id>`). 404 when unknown or
 * outside the viewer's scope (§2: "This page isn't here").
 */
export async function GET_PENALTY(id: Uuid) {
  const response = await apiFetch<PenaltyRecord>(`/hr/penalties/${encodeURIComponent(id)}`, {
    method: 'GET',
    next: { tags: [PENALTIES_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `GET /hr/penalties/preview` — the level and action a new penalty would get. Saves nothing. */
export async function GET_PENALTY_PREVIEW(query: PenaltyPreviewQuery) {
  const response = await apiFetch<PenaltyPreview>('/hr/penalties/preview', {
    method: 'GET',
    params: {
      employeeId: query.employeeId,
      violationId: query.violationId,
      date: query.date,
      stageId: query.stageId,
    },
    cache: 'no-store',
  });
  return handleResponse({ response, showErrorToast: false });
}

/**
 * `GET /hr/penalties/employee-stages/:employeeId` — the stages a penalty for this employee can be
 * recorded in (main first): one fills in by itself, several → the record dialog asks.
 */
export async function GET_PENALTY_EMPLOYEE_STAGES(employeeId: Uuid) {
  const response = await apiFetch<PenaltyEmployeeStages>(
    `/hr/penalties/employee-stages/${encodeURIComponent(employeeId)}`,
    { method: 'GET', cache: 'no-store' },
  );
  return handleResponse({ response, showErrorToast: false });
}

/**
 * `POST /hr/penalties` — saved as Pending stage review, or straight to Waiting for HR (§4), with the
 * level and action computed now.
 */
export async function CREATE_PENALTY(body: CreatePenaltyRequest) {
  const response = await apiFetch<PenaltyRecord>('/hr/penalties', {
    method: 'POST',
    body: { ...body },
    revalidateTags: [PENALTIES_TAG],
  });
  return handleResponse({ response });
}

/**
 * `POST /hr/penalties/:id/approve` — fixes the level and action. `acknowledgedRecount`: the
 * approved penalties a backdated one moves up, as the dialog listed them (§4) — a 409 with the
 * fresh list (`data.recount`) when they changed meanwhile.
 */
export async function APPROVE_PENALTY(
  id: Uuid,
  acknowledgedRecount?: PenaltyRecountAcknowledgement[],
  note?: string | null,
) {
  const body: ApprovePenaltyRequest = {
    ...(acknowledgedRecount ? { acknowledgedRecount } : {}),
    ...(note ? { note } : {}),
  };
  const response = await apiFetch<PenaltyRecord>(`/hr/penalties/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: { ...body },
    revalidateTags: [PENALTIES_TAG],
  });
  return handleResponse({ response });
}

/** `POST /hr/penalties/:id/review/approve` — the stage head approves (→ Waiting for HR), with an optional note. */
export async function REVIEW_APPROVE_PENALTY(id: Uuid, note?: string | null) {
  const response = await apiFetch<PenaltyRecord>(`/hr/penalties/${encodeURIComponent(id)}/review/approve`, {
    method: 'POST',
    body: note ? { note } : {},
    revalidateTags: [PENALTIES_TAG],
  });
  return handleResponse({ response });
}

/**
 * Rejects with the required reason: at the stage review (`step: 'review'`, the stage head) or at HR.
 * A 409 `PENALTY_WRONG_STEP` (someone acted first) carries the fresh status as `data.status`.
 */
export async function REJECT_PENALTY(id: Uuid, reason: string, step: 'review' | 'hr') {
  const path = step === 'review' ? 'review/reject' : 'reject';
  const response = await apiFetch<PenaltyRecord>(`/hr/penalties/${encodeURIComponent(id)}/${path}`, {
    method: 'POST',
    body: { reason },
    revalidateTags: [PENALTIES_TAG],
  });
  return handleResponse({ response });
}

/** `POST /hr/penalties/:id/cancel` — the reason is required; the record is kept. */
export async function CANCEL_PENALTY(id: Uuid, reason: string) {
  const response = await apiFetch<PenaltyRecord>(`/hr/penalties/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: { reason },
    revalidateTags: [PENALTIES_TAG],
  });
  return handleResponse({ response });
}

/**
 * `GET /hr/penalty-groups?search&active=true` — the record picker's choices: what can be recorded
 * now (retired groups and violations left out), searched by the API by violation or group name.
 */
export async function GET_PENALTY_GROUPS(query: { search?: string } = {}) {
  const response = await apiFetch<PenaltyGroup[]>('/hr/penalty-groups', {
    method: 'GET',
    params: { active: 'true', search: query.search || undefined },
    next: { tags: [CATALOGUE_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}

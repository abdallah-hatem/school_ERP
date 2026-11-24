'use server';

import type {
  ContractLanguage,
  ContractTemplate,
  ContractTemplatePreview,
  ContractTemplatesQuery,
  ContractTemplateSummary,
  CreateContractTemplateRequest,
  SaveContractTemplateResponse,
  UpdateContractTemplateRequest,
  Uuid,
} from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/*
 * Contract templates' endpoints (spec docs/specs/2026-11-24-contract-templates.md → API). Reads are
 * tagged; every write revalidates the templates tag (the list, the editor and the print picker).
 */

const TEMPLATES_TAG = 'hr-contract-templates';

const num = (n: number | undefined) => (n ? String(n) : undefined);

/** `GET /hr/contract-templates?search&hidden&page&limit` — one page, searched by the API (name in either language). */
export async function GET_CONTRACT_TEMPLATES(query: ContractTemplatesQuery = {}) {
  const response = await apiFetch<ContractTemplateSummary[]>('/hr/contract-templates', {
    method: 'GET',
    params: {
      search: query.search || undefined,
      hidden: query.hidden ? 'true' : undefined,
      page: num(query.page),
      limit: num(query.limit),
    },
    next: { tags: [TEMPLATES_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `GET /hr/contract-templates/:id` — the template with its current version's texts. */
export async function GET_CONTRACT_TEMPLATE(id: Uuid) {
  const response = await apiFetch<ContractTemplate>(`/hr/contract-templates/${encodeURIComponent(id)}`, {
    method: 'GET',
    // The editor always opens the newest text: `baseVersion` must be the stored one.
    cache: 'no-store',
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `POST /hr/contract-templates`. */
export async function CREATE_CONTRACT_TEMPLATE(body: CreateContractTemplateRequest) {
  const response = await apiFetch<SaveContractTemplateResponse>('/hr/contract-templates', {
    method: 'POST',
    body: { ...body },
    revalidateTags: [TEMPLATES_TAG],
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `PUT /hr/contract-templates/:id` — 409 `TEMPLATE_CHANGED` when someone saved since `baseVersion`. */
export async function UPDATE_CONTRACT_TEMPLATE(id: Uuid, body: UpdateContractTemplateRequest) {
  const response = await apiFetch<SaveContractTemplateResponse>(`/hr/contract-templates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { ...body },
    revalidateTags: [TEMPLATES_TAG],
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `POST /hr/contract-templates/:id/hide` — out of the print picker; loses its default mark. */
export async function HIDE_CONTRACT_TEMPLATE(id: Uuid) {
  const response = await apiFetch<ContractTemplate>(`/hr/contract-templates/${encodeURIComponent(id)}/hide`, {
    method: 'POST',
    revalidateTags: [TEMPLATES_TAG],
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `POST /hr/contract-templates/:id/show`. */
export async function SHOW_CONTRACT_TEMPLATE(id: Uuid) {
  const response = await apiFetch<ContractTemplate>(`/hr/contract-templates/${encodeURIComponent(id)}/show`, {
    method: 'POST',
    revalidateTags: [TEMPLATES_TAG],
  });
  return handleResponse({ response, showErrorToast: false });
}

/**
 * `GET /hr/contract-templates/preview?employeeId&language` — "Preview with an employee": the values
 * of their current contract (salary fields the reader can't see listed in `hidden`). Read-only.
 */
export async function GET_CONTRACT_TEMPLATE_PREVIEW(employeeId: Uuid, language: ContractLanguage) {
  const response = await apiFetch<ContractTemplatePreview>('/hr/contract-templates/preview', {
    method: 'GET',
    params: { employeeId, language },
    cache: 'no-store',
  });
  return handleResponse({ response, showErrorToast: false });
}

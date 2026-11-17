'use server';

import type {
  AuditActor,
  AuditActorsQuery,
  AuditEntityType,
  AuditEntry,
  AuditListQuery,
  AuditRecordQuery,
  AuditSummary,
} from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/*
 * The activity log's read endpoints (contract → "Audit log", `core/audit`). Never cached: an entry
 * is written by every change in every module, so a tag would have to be revalidated everywhere.
 */

const str = (n: number | undefined) => (n === undefined ? undefined : String(n));

/** `GET /audit` — the Activity page: filters, search and server paging. */
export async function GET_AUDIT(query: AuditListQuery) {
  const action = query.action === undefined ? undefined : ([] as string[]).concat(query.action).join(',');
  const response = await apiFetch<AuditEntry[]>('/audit', {
    params: {
      page: str(query.page),
      limit: str(query.limit),
      q: query.q,
      module: query.module,
      action,
      actorId: query.actorId,
      from: query.from,
      to: query.to,
    },
    cache: 'no-store',
  });
  return handleResponse({ response });
}

/** `GET /audit/records/:entityType/:entityId` — one record's History. */
export async function GET_RECORD_AUDIT(entityType: AuditEntityType, entityId: string, query: AuditRecordQuery) {
  const response = await apiFetch<AuditEntry[]>(
    `/audit/records/${entityType}/${encodeURIComponent(entityId)}`,
    {
      params: { page: str(query.page), limit: str(query.limit), actorId: query.actorId, field: query.field },
      cache: 'no-store',
    },
  );
  return handleResponse({ response });
}

/** `GET /audit/records/:entityType/:entityId/fields` — the History tab's field filter. */
export async function GET_RECORD_AUDIT_FIELDS(entityType: AuditEntityType, entityId: string) {
  const response = await apiFetch<string[]>(`/audit/records/${entityType}/${encodeURIComponent(entityId)}/fields`, {
    cache: 'no-store',
  });
  return handleResponse({ response });
}

/** `GET /audit/actors` — the person pickers (everyone, or the people on one record). */
export async function GET_AUDIT_ACTORS(query: AuditActorsQuery = {}) {
  const response = await apiFetch<AuditActor[]>('/audit/actors', {
    params: { entityType: query.entityType, entityId: query.entityId },
    cache: 'no-store',
  });
  return handleResponse({ response });
}

/** `GET /audit/summary` — "today at a glance". */
export async function GET_AUDIT_SUMMARY(from: string, to: string) {
  const response = await apiFetch<AuditSummary>('/audit/summary', { params: { from, to }, cache: 'no-store' });
  return handleResponse({ response });
}

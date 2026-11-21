import type { AuditEntityType } from '@school-erp/shared';
import { can } from '@/core/auth/permissions';
import { getSession } from '@/core/auth/session';
import { notFound } from 'next/navigation';
import type { Locale } from '@/shared/lib/i18n';
import { GET_AUDIT_ACTORS, GET_RECORD_AUDIT, GET_RECORD_AUDIT_FIELDS } from './apis';
import { NoAuditAccess } from './components/no-access';
import { RecordHistory } from './components/record-history';
import { parseHistoryQuery, toAuditRecordQuery, type SearchParamsRecord } from './lib/history-query';
import { AuditI18n } from './messages';

/**
 * Server: one record's History tab — its entries for the URL's page / field / person, the fields
 * it changed and the people who changed it (the filters). Needs `core.audit.view` (D10). A record
 * whose entries the viewer may not read (the API's 404: outside their scope, P4) is the not-found
 * page, as §9 says — e.g. a payroll run for someone who sees only part of the school's payroll.
 */
export async function RecordHistoryScreen({
  locale,
  entityType,
  entityId,
  recordName,
  description,
  emptyBody,
  basePath,
  searchParams,
}: {
  locale: Locale;
  entityType: AuditEntityType;
  entityId: string;
  recordName: string;
  /** The sentence under the title, when the default one doesn't fit (`RecordHistory`). */
  description?: string;
  /** The empty state's sentence, when the employee one doesn't fit (`RecordHistory`). */
  emptyBody?: string;
  basePath: string;
  searchParams: SearchParamsRecord;
}) {
  if (!can(await getSession(), 'core.audit.view')) {
    return (
      <AuditI18n locale={locale}>
        <NoAuditAccess />
      </AuditI18n>
    );
  }
  const query = parseHistoryQuery(searchParams);
  const [entries, fields, actors] = await Promise.all([
    GET_RECORD_AUDIT(entityType, entityId, toAuditRecordQuery(query)),
    GET_RECORD_AUDIT_FIELDS(entityType, entityId),
    // The person filter asks the API as the person types; here only the chosen one's name.
    query.actorId ? GET_AUDIT_ACTORS({ entityType, entityId, id: query.actorId }) : Promise.resolve(null),
  ]);
  if (entries.success === false && entries.status === 404) notFound();
  return (
    <AuditI18n locale={locale}>
      <RecordHistory
        basePath={basePath}
        recordName={recordName}
        description={description}
        emptyBody={emptyBody}
        query={query}
        entries={entries.success ? (entries.data ?? []) : []}
        total={entries.success ? (entries.meta?.total ?? 0) : 0}
        fields={fields.success ? (fields.data ?? []) : []}
        actors={actors?.success ? (actors.data ?? []) : []}
        record={{ entityType, entityId }}
        now={new Date().toISOString()}
        error={!entries.success}
      />
    </AuditI18n>
  );
}

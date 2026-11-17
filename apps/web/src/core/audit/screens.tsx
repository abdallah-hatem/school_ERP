import type { AuditEntityType } from '@school-erp/shared';
import { can } from '@/core/auth/permissions';
import { getSession } from '@/core/auth/session';
import type { Locale } from '@/shared/lib/i18n';
import { GET_AUDIT_ACTORS, GET_RECORD_AUDIT, GET_RECORD_AUDIT_FIELDS } from './apis';
import { NoAuditAccess } from './components/no-access';
import { RecordHistory } from './components/record-history';
import { parseHistoryQuery, toAuditRecordQuery, type SearchParamsRecord } from './lib/history-query';
import { AuditI18n } from './messages';

/**
 * Server: one record's History tab — its entries for the URL's page / field / person, the fields
 * it changed and the people who changed it (the filters). Needs `core.audit.view` (D10).
 */
export async function RecordHistoryScreen({
  locale,
  entityType,
  entityId,
  recordName,
  basePath,
  searchParams,
}: {
  locale: Locale;
  entityType: AuditEntityType;
  entityId: string;
  recordName: string;
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
    GET_AUDIT_ACTORS({ entityType, entityId }),
  ]);
  return (
    <AuditI18n locale={locale}>
      <RecordHistory
        basePath={basePath}
        recordName={recordName}
        query={query}
        entries={entries.success ? (entries.data ?? []) : []}
        total={entries.success ? (entries.meta?.total ?? 0) : 0}
        fields={fields.success ? (fields.data ?? []) : []}
        actors={actors.success ? (actors.data ?? []) : []}
        now={new Date().toISOString()}
        error={!entries.success}
      />
    </AuditI18n>
  );
}

import { AuditI18n, NoAuditAccess, schoolDay, schoolDayRange } from '@/core/audit';
import { GET_AUDIT, GET_AUDIT_ACTORS, GET_AUDIT_SUMMARY } from '@/core/audit/apis';
import { can } from '@/core/auth/permissions';
import { getSession } from '@/core/auth/session';
import type { Locale } from '@/shared/lib/i18n';
import { ActivityView } from './components/activity-view';
import { parseActivityQuery, toAuditListQuery, type SearchParamsRecord } from './lib/query';

/**
 * Server: the Activity page for the URL's filters — one page of entries, the people for the
 * picker and today's counts. Needs `core.audit.view` (D10); the API refuses without it anyway.
 */
export async function ActivityScreen({ locale, searchParams }: { locale: Locale; searchParams: SearchParamsRecord }) {
  if (!can(await getSession(), 'core.audit.view')) {
    return (
      <AuditI18n locale={locale}>
        <NoAuditAccess />
      </AuditI18n>
    );
  }
  const query = parseActivityQuery(searchParams);
  const apiQuery = toAuditListQuery(query);
  const now = new Date().toISOString();
  const today = schoolDay(now);
  const todayRange = schoolDayRange(today, today);
  const [entries, actors, summary] = await Promise.all([
    // Filters that can't match anything (Settings + "Signed in") need no request.
    apiQuery ? GET_AUDIT(apiQuery) : Promise.resolve(null),
    GET_AUDIT_ACTORS(),
    GET_AUDIT_SUMMARY(todayRange.from, todayRange.to),
  ]);
  const ok = entries === null || entries.success;
  return (
    <AuditI18n locale={locale}>
      <ActivityView
        basePath={`/${locale}/activity`}
        query={query}
        entries={entries?.success ? (entries.data ?? []) : []}
        total={entries?.success ? (entries.meta?.total ?? 0) : 0}
        actors={actors.success ? (actors.data ?? []) : []}
        summary={summary.success ? (summary.data ?? null) : null}
        now={now}
        error={!ok}
      />
    </AuditI18n>
  );
}

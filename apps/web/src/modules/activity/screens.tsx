import { AuditI18n, NoAuditAccess, schoolDay, schoolDayRange } from '@/core/audit';
import type { AuditEntry, AuditListQuery, IsoDate } from '@school-erp/shared';
import { GET_AUDIT, GET_AUDIT_ACTORS, GET_AUDIT_DAY_TOTALS, GET_AUDIT_SUMMARY } from '@/core/audit/apis';
import { can } from '@/core/auth/permissions';
import { getSession } from '@/core/auth/session';
import type { Locale } from '@/shared/lib/i18n';
import { ActivityView } from './components/activity-view';
import { parseActivityQuery, toAuditListQuery, type SearchParamsRecord } from './lib/query';

/**
 * Each school day on the page, counted whole for the same filters (`GET /audit/day-totals`), so a
 * day header says how many entries that day has — not how many landed on this page. Null when the
 * counts can't be loaded: the headers then show no count rather than a wrong one.
 */
async function dayTotalsFor(
  query: AuditListQuery,
  entries: AuditEntry[],
): Promise<Partial<Record<IsoDate, number>> | undefined> {
  const days = [...new Set(entries.map((e) => schoolDay(e.at)))];
  if (days.length === 0) return undefined;
  const totals = await GET_AUDIT_DAY_TOTALS({
    q: query.q,
    module: query.module,
    action: query.action,
    actorId: query.actorId,
    periods: days.map((d) => schoolDayRange(d, d)),
  });
  if (!totals.success || !totals.data) return undefined;
  const counts = totals.data;
  return Object.fromEntries(days.map((d, i) => [d, counts[i]]));
}

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
    // The person picker asks the API as the person types; here only the chosen one (the chip's name).
    query.actorId ? GET_AUDIT_ACTORS({ id: query.actorId }) : Promise.resolve(null),
    GET_AUDIT_SUMMARY(todayRange.from, todayRange.to),
  ]);
  const ok = entries === null || entries.success;
  const dayTotals =
    apiQuery && entries?.success ? await dayTotalsFor(apiQuery, entries.data ?? []) : undefined;
  return (
    <AuditI18n locale={locale}>
      <ActivityView
        basePath={`/${locale}/activity`}
        query={query}
        entries={entries?.success ? (entries.data ?? []) : []}
        total={entries?.success ? (entries.meta?.total ?? 0) : 0}
        actors={actors?.success ? (actors.data ?? []) : []}
        summary={summary.success ? (summary.data ?? null) : null}
        dayTotals={dayTotals}
        now={now}
        error={!ok}
      />
    </AuditI18n>
  );
}

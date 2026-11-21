import { monthOf, type PenaltyRecord, type Uuid } from '@school-erp/shared';
import { notFound } from 'next/navigation';
import type { Locale } from '@/shared/lib/i18n';
import { GET_STAGES } from '../employees/apis';
import { GET_PENALTIES, GET_PENALTY } from './apis';
import { ProfileEmployeePenalties } from './components/employee-penalties';
import { PenaltiesList } from './components/penalties-list';
import { focusedPenaltyId, parsePagingQuery, parsePenaltiesQuery, type SearchParamsRecord } from './lib/list-query';

import { PenaltiesI18n } from './messages';

/**
 * Server: one penalty a link opens (`?penalty=<id>`, a notification's, §11). Unknown or outside the
 * viewer's scope (404), or malformed (400) → the not-found page, like any record they can't see (§2);
 * any other failure throws to the route's error boundary.
 */
async function loadFocused(id: Uuid): Promise<PenaltyRecord> {
  const res = await GET_PENALTY(id);
  if (res.success === false && (res.status === 404 || res.status === 400)) notFound();
  if (!res.success || !res.data) throw new Error(res.message ?? 'Penalty failed to load');
  return res.data;
}

/**
 * Server: the penalties list for the URL's month / status / search (the record dialog's pickers ask
 * the API themselves as the person types).
 * With `?penalty=<id>` the list shows that penalty's month and opens the penalty over it.
 */
export async function PenaltiesScreen({ locale, searchParams }: { locale: Locale; searchParams: SearchParamsRecord }) {
  const currentMonth = monthOf(new Date());
  const focusId = focusedPenaltyId(searchParams);
  const focused = focusId ? await loadFocused(focusId) : undefined;
  const parsed = parsePenaltiesQuery(searchParams, currentMonth);
  const query = focused ? { ...parsed, month: monthOf(focused.date) } : parsed;
  const [penalties, stage] = await Promise.all([
    GET_PENALTIES(query),
    // The stage filter's chosen stage, by id: its name shows on the filter at once.
    query.stageId ? GET_STAGES({ ids: [query.stageId], includeHidden: true }) : Promise.resolve(null),
  ]);
  return (
    <PenaltiesI18n locale={locale}>
      <PenaltiesList
        basePath={`/${locale}/penalties`}
        query={query}
        currentMonth={currentMonth}
        rows={penalties.success ? (penalties.data ?? []) : []}
        total={penalties.success ? (penalties.meta?.total ?? 0) : 0}
        error={!penalties.success}
        focused={focused}
        selectedStage={stage?.success ? (stage.data?.[0] ?? null) : null}
      />
    </PenaltiesI18n>
  );
}

/**
 * Server: one employee's penalties, every month, newest first (the profile tab). Fetches only the
 * penalties — the employee comes from the profile layout, which already loaded it.
 */
export async function EmployeePenaltiesScreen({
  locale,
  employeeId,
  searchParams,
}: {
  locale: Locale;
  employeeId: Uuid;
  searchParams: SearchParamsRecord;
}) {
  const { page, limit } = parsePagingQuery(searchParams);
  const penalties = await GET_PENALTIES({ employeeId, page, limit });
  return (
    <PenaltiesI18n locale={locale}>
      <ProfileEmployeePenalties
        employeesPath={`/${locale}/employees`}
        rows={penalties.success ? (penalties.data ?? []) : []}
        total={penalties.success ? (penalties.meta?.total ?? 0) : 0}
        page={page}
        limit={limit}
        error={!penalties.success}
      />
    </PenaltiesI18n>
  );
}

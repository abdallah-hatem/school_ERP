/*
 * core/audit (web) — the activity log's reusable pieces: endpoints, the timeline, entry text and
 * the record History. The Activity screen itself is `modules/activity`; a record's History tab
 * (employee profile) renders `RecordHistoryScreen` from `./screens` (server only).
 */
export { AuditTimeline, AuditTimelineSkeleton, type TimelineGrouping } from './components/timeline';
export { RecordHistory, RecordHistorySkeleton, type RecordHistoryProps } from './components/record-history';
export { NoAuditAccess } from './components/no-access';
export { AuditFiltersSheet } from './components/filters-sheet';
export { AuditI18n, auditMessages } from './messages';
export { actorName, changeRows, entrySentence, fieldLabel, formatAuditValue, labelIn, recordHref } from './lib/entry-text';
export {
  AUDIT_PAGE_SIZE,
  parseHistoryQuery,
  settingsActivityHref,
  type HistoryQuery,
  type SearchParamsRecord,
} from './lib/history-query';
export { addDays, formatFilterRange, schoolDay, schoolDayRange, SCHOOL_TIME_ZONE } from './lib/time';

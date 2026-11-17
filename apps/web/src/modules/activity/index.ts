/*
 * Front door of the Activity screen (audit spec → Screens, layout option B). The reusable audit
 * pieces (timeline, entry text, endpoints) live in `core/audit`; this module is the page itself:
 * filters panel, today's counts and paging. Routes under `app/[locale]/(dashboard)/activity` import
 * from here only.
 */
export { ActivityScreen } from './screens';
export { ActivitySkeleton } from './components/activity-skeleton';
export { ActivityView, type ActivityViewProps } from './components/activity-view';
export { parseActivityQuery, type ActivityQuery, type SearchParamsRecord } from './lib/query';

/*
 * core/notifications (web) — the bell in the app shell's top bar, its list, the per-type switch
 * list and My account → Notifications (spec docs/specs/2026-11-18-notifications.md, option A).
 * Settings → Notifications (modules/settings) builds on `TypeSwitchList` and the endpoints here.
 * Types' texts and link builders live in `@school-erp/shared`, so nothing here knows a module.
 */
export { BELL_POLL_MS, NotificationBell, NotificationInbox } from './components/notification-bell';
export { NotificationPreferencesSkeleton, NotificationPreferencesView } from './components/preferences-view';
export { TypeSwitchList, type TypeSwitchRow } from './components/type-switch-list';
export { NotificationsI18n, notificationMessages } from './messages';
export {
  GET_NOTIFICATION_PREFERENCES,
  GET_NOTIFICATION_SETTINGS,
  UPDATE_NOTIFICATION_SETTINGS,
} from './apis';

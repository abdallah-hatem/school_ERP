/*
 * core/notifications (§11, spec docs/specs/2026-11-18-notifications.md). A module sends through
 * `NotificationsService`: `notify()` / `resolve()` inside its own transaction (or an outbox
 * listener's), and registers a `NotificationScopeResolver` at start-up for its scoped subjects.
 * Types, texts and links live in `packages/shared` (`NOTIFICATION_TYPES`).
 */
export { NotificationsModule } from './notifications.module';
export {
  NotificationsService,
  NotificationOutsideTransactionError,
  type NotifyInput,
  type ResolveInput,
} from './notifications.service';
export {
  NoNotificationScopeResolverError,
  type NotificationScopeResolver,
} from './notification-scope';
export { NotificationTypes, UnknownNotificationTypeError } from './notification-types';
export { NOTIFICATIONS_PURGE_JOB } from './notifications-purge.job';

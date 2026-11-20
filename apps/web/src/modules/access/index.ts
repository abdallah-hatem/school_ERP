/*
 * Front door of Administration → Users and Roles, and My account (spec roles-permissions, P3,
 * option A). Routes under `app/[locale]/(dashboard)/users`, `roles` and `account` import from here
 * only. The forced "Set a new password" page belongs to core/auth.
 */
export { AccountNotificationsScreen, AccountScreen, RoleScreen, RolesScreen, UserScreen, UsersScreen } from './screens';
export { AccountNotificationsSkeleton, FormPageSkeleton, RolesListSkeleton, UsersListSkeleton } from './components/skeletons';
export type { SearchParamsRecord } from './lib/users-query';

import { PAGINATION, SYSTEM_ADMIN_ROLE, type Role, type UserAccount } from '@school-erp/shared';
import { can } from '@/core/auth/permissions';
import { GET_NOTIFICATION_PREFERENCES, NotificationsI18n } from '@/core/notifications';
import { getSession } from '@/core/auth/session';
import type { Locale } from '@/shared/lib/i18n';
import { GET_MY_ACCOUNT, GET_ROLE, GET_ROLES, GET_USER, GET_USERS } from './apis';
import { AccountNotificationsView } from './components/account-notifications';
import { AccountView } from './components/account-view';
import { AccessState } from './components/no-access';
import { RoleForm } from './components/role-form';
import { RolesList } from './components/roles-list';
import { UserForm } from './components/user-form';
import { generateTemporaryPassword } from './lib/temp-password';
import { UsersList } from './components/users-list';
import { parseUsersQuery, type SearchParamsRecord } from './lib/users-query';
import { AccessI18n } from './messages';

/*
 * Server screens of Administration → Users / Roles and My account (spec P3, option A). Each reads
 * what its page needs with the signed-in user's session; the page components are client-side.
 */

const usersPath = (locale: Locale) => `/${locale}/users`;
const rolesPath = (locale: Locale) => `/${locale}/roles`;

/** The only active System admin's id when there is exactly one, else null (R8, edge case 5). */
async function loneSystemAdmin(roles: Role[]): Promise<string | null> {
  const admin = roles.find((r) => r.key === SYSTEM_ADMIN_ROLE);
  if (!admin) return null;
  const res = await GET_USERS({ roleId: admin.id, status: 'active', limit: 2 });
  if (!res.success || (res.meta?.total ?? 0) !== 1) return null;
  return res.data?.[0]?.id ?? null;
}

export async function UsersScreen({ locale, searchParams }: { locale: Locale; searchParams: SearchParamsRecord }) {
  if (!can(await getSession(), 'core.users.view')) {
    return (
      <AccessI18n locale={locale}>
        <AccessState kind="users" />
      </AccessI18n>
    );
  }
  const query = parseUsersQuery(searchParams);
  const [users, roles] = await Promise.all([GET_USERS(query), GET_ROLES()]);
  const roleList = roles.success ? (roles.data ?? []) : [];
  return (
    <AccessI18n locale={locale}>
      <UsersList
        basePath={usersPath(locale)}
        query={query}
        rows={users.success ? (users.data ?? []) : []}
        total={users.success ? (users.meta?.total ?? 0) : 0}
        roles={roleList}
        lastAdminId={await loneSystemAdmin(roleList)}
        now={new Date().toISOString()}
        error={!users.success}
      />
    </AccessI18n>
  );
}

/** Add a user (`id` absent) or open one. */
export async function UserScreen({ locale, id }: { locale: Locale; id?: string }) {
  const session = await getSession();
  if (!can(session, id ? 'core.users.view' : 'core.users.manage')) {
    return (
      <AccessI18n locale={locale}>
        <AccessState kind="users" />
      </AccessI18n>
    );
  }
  const [user, roles] = await Promise.all([id ? GET_USER(id) : Promise.resolve(null), GET_ROLES()]);
  if (id && !user?.success) {
    return (
      <AccessI18n locale={locale}>
        <AccessState kind="notFound" />
      </AccessI18n>
    );
  }
  const roleList = roles.success ? (roles.data ?? []) : [];
  const account = user?.success ? user.data : undefined;
  const lone = account ? await loneSystemAdmin(roleList) : null;
  return (
    <AccessI18n locale={locale}>
      <UserForm
        basePath={usersPath(locale)}
        user={account}
        roles={roleList}
        lastAdmin={Boolean(account) && lone === account?.id}
        initialPassword={account ? undefined : generateTemporaryPassword()}
        now={new Date().toISOString()}
      />
    </AccessI18n>
  );
}

export async function RolesScreen({ locale }: { locale: Locale }) {
  const session = await getSession();
  if (!can(session, 'core.roles.view')) {
    return (
      <AccessI18n locale={locale}>
        <AccessState kind="roles" />
      </AccessI18n>
    );
  }
  // Who holds each role, for the avatars: one page of everyone is plenty for a school's accounts;
  // the count beside them comes from the role itself.
  const [roles, users] = await Promise.all([
    GET_ROLES(),
    can(session, 'core.users.view') ? GET_USERS({ limit: PAGINATION.maxLimit }) : Promise.resolve(null),
  ]);
  const holderNames: Record<string, string[]> = {};
  for (const u of users?.success ? (users.data ?? []) : []) {
    for (const r of u.roles) (holderNames[r.id] ??= []).push(u.name);
  }
  return (
    <AccessI18n locale={locale}>
      <RolesList
        basePath={rolesPath(locale)}
        roles={roles.success ? (roles.data ?? []) : []}
        holderNames={holderNames}
        error={!roles.success}
      />
    </AccessI18n>
  );
}

/** Add a custom role (`id` absent; `from` = duplicate that role) or open one. */
export async function RoleScreen({ locale, id, from }: { locale: Locale; id?: string; from?: string }) {
  const session = await getSession();
  if (!can(session, id ? 'core.roles.view' : 'core.roles.manage')) {
    return (
      <AccessI18n locale={locale}>
        <AccessState kind="roles" />
      </AccessI18n>
    );
  }
  const source = id ?? from;
  const [role, holders] = await Promise.all([
    source ? GET_ROLE(source) : Promise.resolve(null),
    id && can(session, 'core.users.view') ? GET_USERS({ roleId: id, limit: 8 }) : Promise.resolve(null),
  ]);
  if (id && !role?.success) {
    return (
      <AccessI18n locale={locale}>
        <AccessState kind="notFound" />
      </AccessI18n>
    );
  }
  const found = role?.success ? role.data : undefined;
  const holderList: UserAccount[] = holders?.success ? (holders.data ?? []) : [];
  return (
    <AccessI18n locale={locale}>
      <RoleForm
        basePath={rolesPath(locale)}
        usersPath={usersPath(locale)}
        role={id ? found : undefined}
        copyFrom={id ? undefined : found}
        holders={holderList}
        holdersTotal={holders?.success ? (holders.meta?.total ?? 0) : (found?.userCount ?? 0)}
      />
    </AccessI18n>
  );
}

export async function AccountNotificationsScreen({ locale }: { locale: Locale }) {
  const preferences = await GET_NOTIFICATION_PREFERENCES();
  return (
    <AccessI18n locale={locale}>
      <NotificationsI18n locale={locale}>
        {preferences.success && preferences.data ? (
          <AccountNotificationsView preferences={preferences.data} />
        ) : (
          <AccessState kind="notFound" />
        )}
      </NotificationsI18n>
    </AccessI18n>
  );
}

export async function AccountScreen({ locale }: { locale: Locale }) {
  const account = await GET_MY_ACCOUNT();
  return (
    <AccessI18n locale={locale}>
      {account.success && account.data ? (
        <AccountView account={account.data} now={new Date().toISOString()} />
      ) : (
        <AccessState kind="notFound" />
      )}
    </AccessI18n>
  );
}

import { SYSTEM_ADMIN_ROLE, type Role, type UserAccount } from '@school-erp/shared';
import { can } from '@/core/auth/permissions';
import { GET_NOTIFICATION_PREFERENCES, NotificationsI18n } from '@/core/notifications';
import { getSession } from '@/core/auth/session';
import { GET_PUSH_DEVICES } from '@/core/pwa';
import type { ReactNode } from 'react';
import type { Locale } from '@/shared/lib/i18n';
import { GET_MY_ACCOUNT, GET_ROLE, GET_ROLES, GET_USER, GET_USERS } from './apis';
import { AccountHeader } from './components/account-header';
import { AccountNotificationsView } from './components/account-notifications';
import { AccountView } from './components/account-view';
import { AccessState } from './components/no-access';
import { RoleForm } from './components/role-form';
import type { RoleHolder } from './components/role-bits';
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
  // The role filter's choices are searched by the API; here the roles' first page (it holds the
  // System admin, for the last-admin rule) and the chosen role's name.
  const [users, roles, chosen] = await Promise.all([
    GET_USERS(query),
    GET_ROLES(),
    query.roleId ? GET_ROLE(query.roleId) : Promise.resolve(null),
  ]);
  const roleList = roles.success ? (roles.data ?? []) : [];
  return (
    <AccessI18n locale={locale}>
      <UsersList
        basePath={usersPath(locale)}
        query={query}
        rows={users.success ? (users.data ?? []) : []}
        total={users.success ? (users.meta?.total ?? 0) : 0}
        selectedRole={chosen?.success ? (chosen.data ?? null) : null}
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

/** How many of a role's holders its avatar stack shows. */
const HOLDERS_SHOWN = 3;

export async function RolesScreen({ locale }: { locale: Locale }) {
  const session = await getSession();
  if (!can(session, 'core.roles.view')) {
    return (
      <AccessI18n locale={locale}>
        <AccessState kind="roles" />
      </AccessI18n>
    );
  }
  // Who holds each role, for the avatars: the API's first few holders of each role (the count
  // beside them comes from the role itself) — never every account, grouped here.
  const roles = await GET_ROLES();
  const roleList = roles.success ? (roles.data ?? []) : [];
  const holders: Record<string, RoleHolder[]> = {};
  if (can(session, 'core.users.view')) {
    const pages = await Promise.all(roleList.map((r) => GET_USERS({ roleId: r.id, limit: HOLDERS_SHOWN })));
    roleList.forEach((r, i) => {
      const page = pages[i];
      holders[r.id] = (page?.success ? (page.data ?? []) : []).map((u) => ({ id: u.id, employee: u.employee, isActive: u.isActive }));
    });
  }
  return (
    <AccessI18n locale={locale}>
      <RolesList
        basePath={rolesPath(locale)}
        roles={roleList}
        holders={holders}
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

/** My account's frame (header and tabs), around whichever tab is open. */
export function AccountLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <AccessI18n locale={locale}>
        <AccountHeader />
      </AccessI18n>
      {children}
    </div>
  );
}

export async function AccountNotificationsScreen({ locale }: { locale: Locale }) {
  const [preferences, devices] = await Promise.all([GET_NOTIFICATION_PREFERENCES(), GET_PUSH_DEVICES()]);
  return (
    <AccessI18n locale={locale}>
      <NotificationsI18n locale={locale}>
        {preferences.success && preferences.data ? (
          <AccountNotificationsView
            preferences={preferences.data}
            // The device list is a nicety: if it can't load, the switch says alerts aren't set up.
            devices={devices.success && devices.data ? devices.data : { available: false, publicKey: null, devices: [] }}
          />
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

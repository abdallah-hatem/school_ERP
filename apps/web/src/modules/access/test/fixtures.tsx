import {
  BUILT_IN_ROLES,
  PERMISSION_KEYS,
  PermissionScope,
  type PermissionKey,
  type Role,
  type RoleGrant,
  type SessionUser,
  type UserAccount,
} from '@school-erp/shared';
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from 'react';
import { renderWithI18n } from '@/test/render';
import type { Locale } from '@/shared/lib/i18n';
import { AccessI18n } from '../messages';

/** Test data for the Users / Roles / My account screens. */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const ROLES: Role[] = BUILT_IN_ROLES.map((r, i) => ({
  id: id(100 + i),
  key: r.key,
  nameEn: r.nameEn,
  nameAr: r.nameAr,
  builtIn: true,
  permissions: (r.key === 'system_admin' ? PERMISSION_KEYS.map((k) => [k, 'all']) : Object.entries(r.permissions)).map(
    ([key, scope]) => ({ key, scope }) as RoleGrant,
  ),
  userCount: i === 0 ? 1 : 0,
}));

export const role = (key: string): Role => {
  const found = ROLES.find((r) => r.key === key);
  if (!found) throw new Error(`no role ${key}`);
  return found;
};

export const customRole: Role = {
  id: id(200),
  key: 'custom_ab12cd34',
  nameEn: 'Front desk',
  nameAr: 'مكتب الاستقبال',
  builtIn: false,
  permissions: [{ key: 'hr.employees.view' as PermissionKey, scope: PermissionScope.ALL }],
  userCount: 0,
};

const ref = (r: Role) => ({ id: r.id, key: r.key, nameEn: r.nameEn, nameAr: r.nameAr });

export function account(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: id(1),
    name: 'Hany Saad',
    email: 'hany.saad@school.test',
    isActive: true,
    mustChangePassword: false,
    roles: [ref(role('system_admin')), ref(role('hr_manager'))],
    employee: { id: id(500), code: 'EMP-0002', nameEn: 'Hany Saad', nameAr: 'هاني سعد' },
    createdAt: '2026-11-01T08:00:00.000Z',
    lastSignInAt: '2026-11-17T07:12:00.000Z',
    passwordChangedAt: null,
    lockedUntil: null,
    ...overrides,
  };
}

export const NOW = '2026-11-17T12:00:00.000Z';

export function renderAccess(ui: ReactElement, locale: Locale = 'en', session?: SessionUser | null) {
  return renderWithI18n(<AccessI18n locale={locale}>{ui}</AccessI18n>, {
    locale,
    ...(session === undefined ? {} : { session }),
  });
}

export function MockLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; scroll?: boolean }) {
  const anchor = { ...props };
  delete anchor.scroll;
  return <a {...anchor} onClick={(e) => e.preventDefault()} />;
}

export const ok = <T,>(data: T, meta?: object) => ({ success: true as const, status: 200, data, meta });
export const fail = (error: string, message = error) => ({ success: false as const, status: 409, error, message });

import { PERMISSION_KEYS, type SessionUser } from '@school-erp/shared';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { SessionProvider } from '@/core/auth/session-context';
import { getBaseMessages, type Locale } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

/** The signed-in HR admin, holding every permission (P1) — what tests render as by default. */
export const TEST_SESSION: SessionUser = {
  id: '00000000-0000-4000-8000-0000000000aa',
  email: 'admin@school.test',
  name: 'Test Admin',
  mustChangePassword: false,
  permissions: [...PERMISSION_KEYS],
  roles: [
    { id: '00000000-0000-4000-8000-0000000000r1', key: 'system_admin', nameEn: 'System admin', nameAr: 'مدير النظام' },
    { id: '00000000-0000-4000-8000-0000000000r2', key: 'hr_manager', nameEn: 'HR manager', nameAr: 'مدير شؤون الموظفين' },
  ],
  employee: null,
};

/**
 * Render inside the real translations for `locale` (default English), with `dir` set like the app,
 * signed in as `session` (default: the HR admin with every permission; `null` = signed out).
 */
export function renderWithI18n(
  ui: ReactElement,
  {
    locale = 'en',
    session = TEST_SESSION,
    ...options
  }: RenderOptions & { locale?: Locale; session?: SessionUser | null } = {},
) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider locale={locale} messages={getBaseMessages(locale)}>
        <SessionProvider user={session}>{children}</SessionProvider>
      </I18nProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

/** The HR admin's session without `keys` — a user who can't do those things. */
export function sessionWithout(...keys: string[]): SessionUser {
  return { ...TEST_SESSION, permissions: TEST_SESSION.permissions.filter((k) => !keys.includes(k)) };
}

/** A session holding only `keys` — e.g. the Stage head of P4 (`STAGE_HEAD_KEYS`). */
export function sessionWith(...keys: string[]): SessionUser {
  return { ...TEST_SESSION, roles: [], permissions: TEST_SESSION.permissions.filter((k) => keys.includes(k)) };
}

/** What the built-in Stage head holds (roles-permissions spec, Starting roles). */
export const STAGE_HEAD_KEYS = [
  'hr.employees.view',
  'hr.penalties.view',
  'hr.penalties.record',
  'core.stages.view',
  'hr.penalty_catalogue.view',
] as const;

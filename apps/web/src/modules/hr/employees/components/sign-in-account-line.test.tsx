// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/en/employees/e-mona' }));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));
vi.mock('../apis', () => ({ DEACTIVATE_EMPLOYEE: vi.fn(), REACTIVATE_EMPLOYEE: vi.fn() }));

import type { Employee } from '@school-erp/shared';
import { renderWithI18n, sessionWithout } from '@/test/render';
import { EmployeesI18n } from '../messages';
import { SignInAccountLine } from './employee-profile';

const MONA = { id: 'u-7', name: 'Mona Adel' };

function renderLine(
  account: Employee['signInAccount'],
  locale: 'en' | 'ar' = 'en',
  session = undefined as ReturnType<typeof sessionWithout> | undefined,
) {
  return renderWithI18n(
    <EmployeesI18n locale={locale}>
      <SignInAccountLine account={account} />
    </EmployeesI18n>,
    { locale, ...(session ? { session } : {}) },
  );
}

describe('SignInAccountLine (employee profile)', () => {
  afterEach(cleanup);

  it('linked, viewer may open users: "Signs in as:" and the name links to the user page', () => {
    renderLine(MONA);
    expect(screen.getByText('Signs in as:')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mona Adel' }).getAttribute('href')).toBe('/en/users/u-7');
  });

  it('linked, viewer without core.users.view: the name as plain text, no link', () => {
    renderLine(MONA, 'en', sessionWithout('core.users.view'));
    expect(screen.getByText('Signs in as:')).toBeTruthy();
    expect(screen.getByText('Mona Adel')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('not linked: "No sign-in account"', () => {
    renderLine(null);
    expect(screen.getByText('No sign-in account')).toBeTruthy();
    expect(screen.queryByText('Signs in as:')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('Arabic', () => {
    renderLine(MONA, 'ar');
    expect(screen.getByText('يدخل باسم:')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mona Adel' }).getAttribute('href')).toBe('/ar/users/u-7');
  });
});

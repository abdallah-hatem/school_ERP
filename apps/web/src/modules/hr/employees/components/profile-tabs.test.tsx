// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let pathname = '/en/employees/e-mona';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));
vi.mock('../apis', () => ({ DEACTIVATE_EMPLOYEE: vi.fn(), REACTIVATE_EMPLOYEE: vi.fn() }));

import { renderWithI18n, sessionWithout } from '@/test/render';
import { EmployeesI18n } from '../messages';
import { ProfileTabs } from './employee-profile';

function renderTabs(locale: 'en' | 'ar' = 'en', session = undefined as ReturnType<typeof sessionWithout> | undefined) {
  return renderWithI18n(
    <EmployeesI18n locale={locale}>
      <ProfileTabs profileHref={`/${locale}/employees/e-mona`} />
    </EmployeesI18n>,
    { locale, ...(session ? { session } : {}) },
  );
}

describe('Profile tabs — History (T30)', () => {
  afterEach(cleanup);

  it('History is the last tab, current on its own path', () => {
    pathname = '/en/employees/e-mona/history';
    renderTabs();
    const tabs = screen.getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')]);
    expect(tabs).toEqual([
      ['Details', '/en/employees/e-mona'],
      ['Contracts', '/en/employees/e-mona/contracts'],
      ['Penalties', '/en/employees/e-mona/penalties'],
      ['Payroll', '/en/employees/e-mona/payroll'],
      ['History', '/en/employees/e-mona/history'],
    ]);
    expect(screen.getByRole('link', { name: 'History' }).getAttribute('aria-current')).toBe('page');
  });

  it('is hidden from someone who may not read the activity log (can(), view only)', () => {
    pathname = '/en/employees/e-mona';
    renderTabs('en', sessionWithout('core.audit.view'));
    expect(screen.queryByRole('link', { name: 'History' })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  it('Contracts is shown only with hr.contracts.view (can(), view only)', () => {
    pathname = '/en/employees/e-mona/contracts';
    renderTabs();
    expect(screen.getByRole('link', { name: 'Contracts' }).getAttribute('aria-current')).toBe('page');
    cleanup();
    renderTabs('en', sessionWithout('hr.contracts.view'));
    expect(screen.queryByRole('link', { name: 'Contracts' })).toBeNull();
  });

  it('Arabic label', () => {
    renderTabs('ar');
    expect(screen.getByRole('link', { name: 'السجل' }).getAttribute('href')).toBe('/ar/employees/e-mona/history');
  });
});

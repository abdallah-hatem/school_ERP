// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));

import { entry, NOW, renderAudit } from '../test/fixtures';
import { AuditTimeline } from './timeline';

afterEach(cleanup);

const many = entry({
  action: 'hr.employee.create',
  entityLabel: 'Yasmin Khaled',
  changes: [
    { field: 'nameEn', before: null, after: 'Yasmin Khaled' },
    { field: 'departmentId', before: null, after: { nameEn: 'Science', nameAr: 'العلوم' } },
    { field: 'basicSalary', before: null, after: 1300000 },
    { field: 'hireDate', before: null, after: '2026-11-01' },
  ],
  at: '2026-11-16T08:15:00.000Z',
});

describe('AuditTimeline', () => {
  it('groups by day under Today / Yesterday headers; the actor sits beside the sentence', () => {
    renderAudit(
      <AuditTimeline
        entries={[entry({ at: '2026-11-17T12:24:00.000Z' }), many, entry({ at: '2026-11-15T07:02:00.000Z' })]}
        grouping="day"
        now={NOW}
        label="Activity timeline"
      />,
    );
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Today · Tuesday 17 Nov 20261 entries',
      'Yesterday · Monday 16 Nov 20261 entries',
      'Sunday 15 Nov 20261 entries',
    ]);
    const [first] = screen.getAllByTestId('audit-entry');
    // "Mona Ibrahim edited the employee Omar Fathy" — the sentence omits the actor (T27).
    expect(within(first!).getByText('Mona Ibrahim')).toBeTruthy();
    expect(first!.textContent).toContain('edited the employee Omar Fathy');
    expect(first!.textContent).toContain('12 min ago');
    expect(within(first!).getByRole('link', { name: 'Open record' }).getAttribute('href')).toBe(
      '/en/employees/33333333-3333-4333-8333-333333333333',
    );
  });

  it('shows the first two changes inline and expands "+ n more"', async () => {
    const user = userEvent.setup();
    renderAudit(<AuditTimeline entries={[many]} grouping="day" now={NOW} label="Activity timeline" />);
    expect(screen.getByText('Name (English)')).toBeTruthy();
    expect(screen.getByText('Department')).toBeTruthy();
    expect(screen.queryByText('Basic salary')).toBeNull();
    const more = screen.getByRole('button', { name: '+ 2 more' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await user.click(more);
    expect(screen.getByText('Basic salary')).toBeTruthy();
    expect(screen.getByText('13,000.00')).toBeTruthy();
    expect(screen.getByText('1 Nov 2026')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Basic salary')).toBeNull();
  });

  it('marks money changes and failed sign-ins', () => {
    renderAudit(
      <AuditTimeline
        entries={[
          entry({ changes: [{ field: 'basicSalary', before: 1200000, after: 1300000 }] }),
          entry({
            action: 'core.auth.sign_in_failed',
            module: 'core',
            entityType: 'user',
            entityLabel: 'admin@school.test',
            actor: null,
            changes: [],
          }),
        ]}
        grouping="day"
        now={NOW}
        label="Activity timeline"
      />,
    );
    const [money, failed] = screen.getAllByTestId('audit-entry');
    expect(within(money!).getByText('Money')).toBeTruthy();
    expect(within(failed!).getByText('Failed')).toBeTruthy();
    expect(failed!.textContent).toContain('Failed sign-in attempt for admin@school.test');
    // A failed sign-in has no signed-in actor and no record page.
    expect(within(failed!).queryByRole('link')).toBeNull();
  });

  it('Arabic: verbal-noun sentences joined to the actor, Latin digits, month grouping on History', () => {
    renderAudit(
      <AuditTimeline
        entries={[entry(), entry({ at: '2026-10-12T10:30:00.000Z' })]}
        grouping="month"
        now={NOW}
        label="سجل التغييرات"
      />,
      'ar',
    );
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['نوفمبر 2026', 'أكتوبر 2026']);
    const [first] = screen.getAllByTestId('audit-entry');
    expect(first!.textContent).toContain('Mona Ibrahim · تعديل بيانات الموظف Omar Fathy');
    expect(first!.textContent).toContain('14:24');
    // History has no module chip or record link: the record is the page.
    expect(within(first!).queryByRole('link')).toBeNull();
  });
});

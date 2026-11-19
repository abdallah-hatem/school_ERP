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
  entityLabel: { en: 'Yasmin Khaled', ar: 'ياسمين خالد' },
  changes: [
    { field: 'nameEn', before: null, after: 'Yasmin Khaled' },
    { field: 'departmentId', before: null, after: { nameEn: 'Science', nameAr: 'العلوم' } },
    { field: 'basicSalary', before: null, after: 1300000 },
    { field: 'hireDate', before: null, after: '2026-11-01' },
  ],
  at: '2026-11-16T08:15:00.000Z',
});

describe('AuditTimeline', () => {
  it("groups by day under Today / Yesterday headers, each counting the whole day; the actor sits beside the sentence", () => {
    renderAudit(
      <AuditTimeline
        entries={[entry({ at: '2026-11-17T12:24:00.000Z' }), many, entry({ at: '2026-11-15T07:02:00.000Z' })]}
        grouping="day"
        now={NOW}
        label="Activity timeline"
        // The day's totals come from the API: the page holds one entry of each day.
        dayTotals={{ '2026-11-17': 23, '2026-11-16': 1 }}
      />,
    );
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Today · Tuesday 17 Nov 202623 entries',
      'Yesterday · Monday 16 Nov 20261 entry',
      // No total known for the day: no count rather than the page's.
      'Sunday 15 Nov 2026',
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

  it("an employee's name opens their profile, and so does an actor linked to an employee", () => {
    const EMP = '33333333-3333-4333-8333-333333333333';
    renderAudit(
      <AuditTimeline
        entries={[
          entry({ actor: { id: '44444444-4444-4444-8444-444444444444', name: 'Hana Said', employeeId: 'emp-hana' } }),
          entry({ entityType: 'department', entityLabel: { en: 'Science', ar: 'العلوم' } }),
        ]}
        grouping="day"
        now={NOW}
        label="Activity timeline"
      />,
    );
    const [employeeEdit, departmentEdit] = screen.getAllByTestId('audit-entry');
    expect(within(employeeEdit!).getByRole('link', { name: 'Omar Fathy' }).getAttribute('href')).toBe(`/en/employees/${EMP}`);
    expect(within(employeeEdit!).getByRole('link', { name: 'Hana Said' }).getAttribute('href')).toBe('/en/employees/emp-hana');
    // Not an employee, and an actor with no linked employee: plain text.
    expect(within(departmentEdit!).queryByRole('link', { name: 'Science' })).toBeNull();
    expect(within(departmentEdit!).queryByRole('link', { name: 'Mona Ibrahim' })).toBeNull();
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
            entityLabel: { en: 'admin@school.test', ar: 'admin@school.test' },
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

  it('an insurance edit reads its status label and the insured salary as money (EN and AR)', () => {
    const insured = entry({
      changes: [
        { field: 'insuranceStatus', before: 'NOT_INSURED', after: 'INSURED' },
        { field: 'insuredSalary', before: null, after: 650000 },
      ],
    });
    renderAudit(<AuditTimeline entries={[insured]} grouping="month" now={NOW} label="Record history" />);
    let item = screen.getByTestId('audit-entry');
    expect(within(item).getByText('Not insured')).toBeTruthy();
    expect(within(item).getByText('Insured')).toBeTruthy();
    expect(within(item).getByText('6,500.00')).toBeTruthy();
    expect(item.textContent).not.toContain('NOT_INSURED');
    expect(item.textContent).not.toContain('650000');
    cleanup();

    renderAudit(<AuditTimeline entries={[insured]} grouping="month" now={NOW} label="Record history" />, 'ar');
    item = screen.getByTestId('audit-entry');
    expect(within(item).getByText('غير مؤمَّن عليه')).toBeTruthy();
    expect(within(item).getByText('مؤمَّن عليه')).toBeTruthy();
    expect(within(item).getByText('6,500.00')).toBeTruthy();
    expect(item.textContent).not.toContain('650000');
    cleanup();

    // On Activity the entry is tagged Money.
    renderAudit(<AuditTimeline entries={[insured]} grouping="day" now={NOW} label="Activity timeline" />);
    item = screen.getByTestId('audit-entry');
    expect(within(item).getByText('Money')).toBeTruthy();
    expect(within(item).getByText('Insured')).toBeTruthy();
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
    // The record's Arabic name in the Arabic sentence (finding 3).
    expect(first!.textContent).toContain('Mona Ibrahim · تعديل بيانات الموظف عمر فتحي');
    expect(first!.textContent).toContain('14:24');
    // History has no module chip or record link: the record is the page.
    expect(within(first!).queryByRole('link')).toBeNull();
  });

  it('Arabic day totals use Arabic plural forms', () => {
    const at = '2026-11-17T12:24:00.000Z';
    const totals = (n: number) => {
      cleanup();
      renderAudit(
        <AuditTimeline entries={[entry({ at })]} grouping="day" now={NOW} label="سجل" dayTotals={{ '2026-11-17': n }} />,
        'ar',
      );
      return screen.getByTestId('day-total').textContent;
    };
    expect(totals(1)).toBe('سجل واحد');
    expect(totals(2)).toBe('سجلان');
    expect(totals(5)).toBe('5 سجلات');
    expect(totals(12)).toBe('12 سجلًا');
    expect(totals(100)).toBe('100 سجل');
  });

  it('an entry written with one label (older entries) shows it in both languages', () => {
    renderAudit(
      <AuditTimeline
        entries={[entry({ entityLabel: { en: 'Omar Fathy', ar: 'Omar Fathy' } })]}
        grouping="day"
        now={NOW}
        label="سجل"
      />,
      'ar',
    );
    expect(screen.getByTestId('audit-entry').textContent).toContain('تعديل بيانات الموظف Omar Fathy');
  });

  it('a tax rule change reads as slices with amounts and rates, and the fund as a percent', () => {
    const changed = entry({
      action: 'accounting.settings.update',
      entityType: 'accounting_settings',
      entityLabel: { en: 'Accounting rules', ar: 'قواعد المحاسبة' },
      changes: [
        {
          field: 'accounting.payroll.taxBrackets',
          before: [{ width: 500_000, percent: 0 }, { width: null, percent: 25 }],
          after: [{ width: 300_000, percent: 0 }, { width: null, percent: 12.5 }],
        },
        { field: 'accounting.payroll.martyrPercent', before: 0.05, after: 0.1 },
      ],
    });
    renderAudit(<AuditTimeline entries={[changed]} grouping="day" now={NOW} label="Activity timeline" />);
    const item = screen.getByTestId('audit-entry');
    expect(within(item).getByText('5,000.00 at 0%, the rest at 25%')).toBeTruthy();
    expect(within(item).getByText('3,000.00 at 0%, the rest at 12.5%')).toBeTruthy();
    expect(within(item).getByText('0.1%')).toBeTruthy();
  });

  it('a lateness month reads one line per changed employee, named in the screen\'s language', () => {
    const saved = entry({
      action: 'hr.lateness.save',
      entityType: 'lateness_month',
      entityLabel: { en: '2026-11', ar: '2026-11' },
      changes: [
        { field: 'minutes', before: 0, after: 90, subject: { en: 'Mona Khalil', ar: 'منى خليل' } },
        { field: 'minutes', before: 30, after: 0, subject: { en: 'Salma Adel', ar: 'سلمى عادل' } },
      ],
    });
    renderAudit(<AuditTimeline entries={[saved]} grouping="day" now={NOW} label="Activity timeline" />);
    const item = screen.getByTestId('audit-entry');
    expect(within(item).getByText('Mona Khalil · Minutes')).toBeTruthy();
    expect(within(item).getByText('Salma Adel · Minutes')).toBeTruthy();
  });

  it('a penalty reads with the employee and violation by name and its status in the screen\'s language (T29)', () => {
    const cancelled = entry({
      action: 'hr.penalty.cancel',
      entityType: 'penalty',
      entityLabel: { en: 'Omar Fathy', ar: 'عمر فتحي' },
      changes: [
        { field: 'status', before: 'APPROVED', after: 'CANCELLED' },
        { field: 'cancelReason', before: null, after: 'Recorded twice' },
      ],
    });
    const recorded = entry({
      action: 'hr.penalty.record',
      entityType: 'penalty',
      entityLabel: { en: 'Omar Fathy', ar: 'عمر فتحي' },
      changes: [
        { field: 'violationId', before: null, after: { nameEn: 'Late arrival', nameAr: 'التأخر' } },
        { field: 'action', before: null, after: 'DEDUCT_DAYS' },
      ],
    });
    renderAudit(<AuditTimeline entries={[cancelled, recorded]} grouping="day" now={NOW} label="Activity timeline" />);
    const [first, second] = screen.getAllByTestId('audit-entry');
    expect(first!.textContent).toContain('cancelled the penalty for Omar Fathy');
    expect(within(first!).getByText('Approved')).toBeTruthy();
    expect(within(first!).getByText('Cancelled')).toBeTruthy();
    expect(within(first!).getByText('Cancellation reason')).toBeTruthy();
    expect(second!.textContent).toContain('recorded a penalty for Omar Fathy');
    expect(within(second!).getByText('Late arrival')).toBeTruthy();
    expect(within(second!).getByText('Deduct days')).toBeTruthy();
    cleanup();

    renderAudit(<AuditTimeline entries={[cancelled]} grouping="day" now={NOW} label="Activity timeline" />, 'ar');
    const item = screen.getByTestId('audit-entry');
    expect(item.textContent).toContain('إلغاء جزاء عمر فتحي');
    expect(within(item).getByText('معتمد')).toBeTruthy();
    expect(within(item).getByText('ملغى')).toBeTruthy();
  });

  it('renaming only the Arabic name shows that part with its own label, never "Strike → Strike"', () => {
    const before = { id: 'v1', nameEn: 'Strike', nameAr: 'إضراب قديم', isActive: true, sortOrder: 2 };
    const renamed = entry({
      action: 'hr.violation.update',
      entityType: 'violation',
      entityLabel: { en: 'Strike', ar: 'إضراب' },
      changes: [{ field: 'hr.violations', before, after: { ...before, nameAr: 'إضراب' } }],
    });
    renderAudit(<AuditTimeline entries={[renamed]} grouping="day" now={NOW} label="Activity timeline" />);
    const item = screen.getByTestId('audit-entry');
    expect(within(item).getByText('Violation · Name (Arabic)')).toBeTruthy();
    expect(within(item).getByText('إضراب قديم')).toBeTruthy();
    expect(within(item).getByText('إضراب')).toBeTruthy();
    const changes = item.querySelector('dl') as HTMLElement;
    expect(within(changes).queryByText('Strike')).toBeNull();
    expect(item.textContent).toContain('edited the violation Strike');
  });

  it('hiding a list item reads as its "Shown" part changing, not as a renamed item', () => {
    const before = { id: 'g1', nameEn: 'Test', nameAr: 'تجربة', isActive: true, sortOrder: 1 };
    const hidden = entry({
      action: 'hr.penalty_group.update',
      entityType: 'penalty_group',
      entityLabel: { en: 'Test', ar: 'تجربة' },
      changes: [{ field: 'hr.penaltyGroups', before, after: { ...before, isActive: false } }],
    });
    renderAudit(<AuditTimeline entries={[hidden]} grouping="day" now={NOW} label="Activity timeline" />);
    const item = screen.getByTestId('audit-entry');
    expect(within(item).getByText('Penalty group · Shown')).toBeTruthy();
    expect(within(item).getByText('Yes')).toBeTruthy();
    expect(within(item).getByText('No')).toBeTruthy();
  });

  it('a different item picked (another department) stays one line with both names', () => {
    const moved = entry({
      changes: [
        {
          field: 'departmentId',
          before: { id: 'd1', nameEn: 'Science', nameAr: 'العلوم' },
          after: { id: 'd2', nameEn: 'Maths', nameAr: 'الرياضيات' },
        },
      ],
    });
    renderAudit(<AuditTimeline entries={[moved]} grouping="day" now={NOW} label="Activity timeline" />);
    const item = screen.getByTestId('audit-entry');
    expect(within(item).getByText('Department')).toBeTruthy();
    expect(within(item).getByText('Science')).toBeTruthy();
    // The arrow travels with the new value, so it never ends a line on its own.
    const after = within(item).getByText('Maths');
    expect(after.closest('dd > span')?.textContent).toContain('→');
  });

  it('an employee moved to another department (names stored without ids, T28) reads Department: Science → Maths', () => {
    const moved = entry({
      action: 'hr.employee.update',
      changes: [
        {
          field: 'departmentId',
          before: { nameEn: 'Science', nameAr: 'العلوم' },
          after: { nameEn: 'Maths', nameAr: 'الرياضيات' },
        },
        { field: 'photoUrl', before: null, after: '/files/employee-photos/e1-abc.png' },
      ],
    });
    renderAudit(<AuditTimeline entries={[moved]} grouping="day" now={NOW} label="Activity timeline" />);
    const item = screen.getByTestId('audit-entry');
    expect(within(item).getByText('Department')).toBeTruthy();
    expect(within(item).getByText('Science')).toBeTruthy();
    expect(within(item).getByText('Maths')).toBeTruthy();
    expect(within(item).queryByText(/Name \(English\)/)).toBeNull();
    // A new photo reads as its file name, not the whole path.
    expect(within(item).getByText('e1-abc.png')).toBeTruthy();
  });
});

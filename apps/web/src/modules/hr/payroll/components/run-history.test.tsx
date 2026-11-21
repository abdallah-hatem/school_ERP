// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pathname = vi.hoisted(() => ({ current: '/en/payroll/11111111-1111-4111-8111-111111111111' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname.current,
}));
vi.mock('next/link', async () => ({ default: (await import('@/core/audit/test/fixtures')).MockLink }));
// The run's History screen is a server component around this one; only its props are read here.
vi.mock('@/core/audit/screens', () => ({ RecordHistoryScreen: () => null }));

import { createTranslator } from '@/shared/lib/i18n';
import type { AuditEntry } from '@school-erp/shared';
import { RecordHistory } from '@/core/audit';
import { parseHistoryQuery } from '@/core/audit/lib/history-query';
import { ACTORS, AHMED, entry, NOW, renderAudit } from '@/core/audit/test/fixtures';
import { sessionWithout } from '@/test/render';
import { PayrollRunHistoryScreen } from '../history-screen';
import { payrollMessages } from '../messages';
import { renderPayroll, RUN_ID } from '../test/fixtures';
import { RunTabs } from './run-shell';

afterEach(cleanup);

const RUN = `/en/payroll/${RUN_ID}`;
const TOTALS = {
  employees: 2,
  flagged: 0,
  monthSalary: 2_800_000,
  penaltyAmount: 0,
  latenessAmount: 0,
  adjustmentAdditions: 25_000,
  adjustmentDeductions: 0,
  net: 2_825_000,
};
const run = { module: 'hr' as const, entityType: 'payroll_run' as const, entityId: RUN_ID, entityLabel: { en: '2026-11', ar: '2026-11' } };

/** create → adjust → approve, newest first (as the API answers). */
const ENTRIES: AuditEntry[] = [
  entry({
    ...run,
    action: 'hr.payroll.approve',
    actor: AHMED,
    at: '2026-11-17T12:30:00.000Z',
    changes: [
      { field: 'status', before: 'DRAFT', after: 'APPROVED' },
      { field: 'totals', before: null, after: TOTALS },
    ],
  }),
  entry({
    ...run,
    action: 'hr.payroll.adjustment_add',
    at: '2026-11-17T11:00:00.000Z',
    changes: [
      { field: 'employeeId', before: null, after: { nameEn: 'Salma Adel', nameAr: 'سلمى عادل' } },
      { field: 'type', before: null, after: 'ADDITION' },
      { field: 'amount', before: null, after: 25_000 },
      { field: 'reason', before: null, after: 'Exam supervision' },
    ],
  }),
  entry({
    ...run,
    action: 'hr.payroll.create',
    at: '2026-11-17T10:00:00.000Z',
    changes: [{ field: 'totals', before: null, after: { ...TOTALS, adjustmentAdditions: 0, net: 2_800_000 } }],
  }),
];

function renderRunHistory(locale: 'en' | 'ar' = 'en') {
  const t = createTranslator(payrollMessages(locale), locale);
  return renderAudit(
    <RecordHistory
      basePath={`/${locale}/payroll/${RUN_ID}/history`}
      recordName=""
      description={t('payroll.tabs.historyDescription')}
      query={parseHistoryQuery({})}
      entries={ENTRIES}
      total={ENTRIES.length}
      fields={['amount', 'status', 'totals', 'type']}
      actors={ACTORS}
      now={NOW}
    />,
    locale,
  );
}

describe('Payroll run — History tab', () => {
  it('lists create → adjust → approve in words and money, with the run’s own sentence', () => {
    renderRunHistory();
    expect(screen.getByText("Who did what on this month's payroll — created, recalculated, adjusted, approved — newest first.")).toBeTruthy();
    const [approved, adjusted, created] = screen.getAllByTestId('audit-entry');
    expect(approved!.textContent).toContain('Approved the payroll run for November 2026');
    expect(within(approved!).getByText('Draft')).toBeTruthy();
    expect(within(approved!).getByText('Approved')).toBeTruthy();
    expect(adjusted!.textContent).toContain('Added an adjustment to the payroll run for November 2026');
    expect(within(adjusted!).getByText('Salma Adel')).toBeTruthy();
    expect(within(adjusted!).getByText('Addition')).toBeTruthy();
    // Piastres read as pounds.
    expect(adjusted!.textContent).toMatch(/250\.00/);
    expect(created!.textContent).toContain('Created the payroll run for November 2026');
    // Read like a person writes it: approve = status and net; create = net and head count.
    const labels = (item: HTMLElement) => [...item.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(labels(approved!)).toEqual(['Status', 'Net']);
    expect(labels(created!)).toEqual(['Net', 'Employees']);
    for (const item of [approved, adjusted, created]) {
      expect(item!.textContent).not.toMatch(/ADDITION|DRAFT|APPROVED|25000|2026-11(?!\d)|Totals|Need review/);
    }
  });

  it('"Last change" names the first line the trimmed entry shows: Status for an approve, Net for a create', () => {
    const lastChange = () => {
      const box = screen.getByText(/^(Last change|آخر تغيير)$/).parentElement as HTMLElement;
      return box.querySelector('p.text-xs')?.textContent;
    };
    renderRunHistory();
    expect(lastChange()).toBe('Status');
    cleanup();
    renderRunHistory('ar');
    expect(lastChange()).toBe('الحالة');
    cleanup();
    renderAudit(
      <RecordHistory
        basePath={`/en/payroll/${RUN_ID}/history`}
        recordName=""
        query={parseHistoryQuery({})}
        entries={[ENTRIES[2]!]}
        total={1}
        fields={[]}
        actors={ACTORS}
        now={NOW}
      />,
    );
    expect(lastChange()).toBe('Net');
  });

  it('Arabic: the sentences, values and the run’s description in Arabic', () => {
    renderRunHistory('ar');
    expect(screen.getByText('من فعل ماذا في رواتب هذا الشهر — الإنشاء وإعادة الحساب والتعديلات والاعتماد — الأحدث أولًا.')).toBeTruthy();
    const [approved, adjusted] = screen.getAllByTestId('audit-entry');
    expect(within(approved!).getByText('معتمد')).toBeTruthy();
    expect([...approved!.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['الحالة', 'الصافي']);
    expect(within(adjusted!).getByText('سلمى عادل')).toBeTruthy();
    expect(adjusted!.textContent).not.toMatch(/ADDITION/);
  });
});

describe('Payroll run — History tab, nothing recorded yet', () => {
  it.each([
    ['en', "Creating, recalculating, adjusting and approving this month's payroll will be listed here, with who did it.", /this employee/],
    ['ar', 'ستُسجَّل هنا عمليات إنشاء رواتب هذا الشهر وإعادة حسابها وتعديلها واعتمادها، ومن قام بكلٍّ منها.', /هذا الموظف/],
  ] as const)('%s: the empty state speaks of the run, not of an employee', (locale, sentence, employee) => {
    // The screen hands the run's own sentence to the shared History (not the employee default).
    const screenElement = PayrollRunHistoryScreen({ locale, runId: RUN_ID, searchParams: {} });
    expect(screenElement.props.emptyBody).toBe(sentence);
    renderAudit(
      <RecordHistory
        basePath={`/${locale}/payroll/${RUN_ID}/history`}
        recordName=""
        emptyBody={screenElement.props.emptyBody}
        query={parseHistoryQuery({})}
        entries={[]}
        total={0}
        fields={[]}
        actors={[]}
        now={NOW}
      />,
      locale,
    );
    expect(screen.getByText(sentence)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(employee);
  });
});

describe('Payroll run — tabs', () => {
  it('Employees and History, the current one from the URL; History links to the run’s history', () => {
    pathname.current = `${RUN}/history`;
    renderPayroll(<RunTabs runHref={RUN} />);
    const nav = screen.getByRole('navigation', { name: 'Payroll run sections' });
    const employees = within(nav).getByRole('link', { name: 'Employees' });
    const history = within(nav).getByRole('link', { name: 'History' });
    expect(employees.getAttribute('href')).toBe(RUN);
    expect(history.getAttribute('href')).toBe(`${RUN}/history`);
    expect(history.getAttribute('aria-current')).toBe('page');
    expect(employees.getAttribute('aria-current')).toBeNull();
  });

  it('no History tab without the activity log permission', () => {
    pathname.current = RUN;
    renderPayroll(<RunTabs runHref={RUN} />, 'en', sessionWithout('core.audit.view'));
    const nav = screen.getByRole('navigation', { name: 'Payroll run sections' });
    expect(within(nav).getByRole('link', { name: 'Employees' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).queryByRole('link', { name: 'History' })).toBeNull();
  });

  it('Arabic labels', () => {
    pathname.current = `/ar/payroll/${RUN_ID}`;
    renderPayroll(<RunTabs runHref={`/ar/payroll/${RUN_ID}`} />, 'ar');
    const nav = screen.getByRole('navigation', { name: 'أقسام مسيّر الرواتب' });
    expect(within(nav).getByRole('link', { name: 'الموظفون' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'السجل' })).toBeTruthy();
  });
});

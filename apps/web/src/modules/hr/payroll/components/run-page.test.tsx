// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  redirect: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
const apis = vi.hoisted(() => ({
  APPROVE_PAYROLL_RUN: vi.fn(),
  RECALCULATE_PAYROLL_RUN: vi.fn(),
  GET_BANK_SHEET: vi.fn(),
  ADD_PAYROLL_ADJUSTMENT: vi.fn(),
  REMOVE_PAYROLL_ADJUSTMENT: vi.fn(),
}));
vi.mock('../apis', () => apis);
const download = vi.hoisted(() => ({ saveDownloadedFile: vi.fn() }));
vi.mock('@/shared/lib/download', () => download);

import type { PayrollRunQuery } from '@school-erp/shared';
import type { Locale } from '@/shared/lib/i18n';
import { ADJ_MONA, MONA, renderPayroll, run, RUN_ID, SALMA, SETTINGS } from '../test/fixtures';
import { RunPage, type RunPageProps } from './run-page';

const DEPARTMENTS = [
  {
    id: 'd-math',
    nameEn: 'Mathematics',
    nameAr: 'الرياضيات',
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'd-sci',
    nameEn: 'Science',
    nameAr: 'العلوم',
    isActive: false,
    sortOrder: 2,
  },
];

function renderRun(props: Partial<RunPageProps> = {}, locale: Locale = 'en') {
  const r = props.run ?? run();
  return renderPayroll(
    <RunPage
      basePath={`/${locale}/payroll`}
      settingsHref={`/${locale}/settings`}
      run={r}
      runEmployeeIds={r.lines.map((l) => l.employeeId)}
      departments={DEPARTMENTS}
      settings={SETTINGS}
      query={{} as PayrollRunQuery}
      {...props}
    />,
    locale,
  );
}

function table() {
  const el = document.querySelector<HTMLElement>('[data-view="table"]');
  if (!el) throw new Error('table view not rendered');
  return within(el);
}

const approveButton = () => screen.getByRole('button', { name: 'Approve payroll' });
// The API answers in the `lang` cookie's language; the page shows the code's text in its own.
const PENDING = {
  success: false,
  status: 409,
  error: 'PENDING_PENALTIES',
  message: 'اعتمد أو ألغِ جزاءات هذا الشهر المعلقة أولًا.',
};
const PENDING_EN = "Approve or cancel this month's pending penalties first.";

beforeEach(() => {
  for (const fn of [
    ...Object.values(apis),
    ...Object.values(router),
    toast.error,
    toast.success,
    download.saveDownloadedFile,
  ])
    fn.mockReset();
});
afterEach(cleanup);

describe('RunPage — approve', () => {
  it("approve with pending penalties → the server's 409 PENDING_PENALTIES is shown as the message", async () => {
    const user = userEvent.setup();
    apis.APPROVE_PAYROLL_RUN.mockResolvedValue(PENDING);
    renderRun();
    await user.click(approveButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Approve and lock' }));

    expect(apis.APPROVE_PAYROLL_RUN).toHaveBeenCalledWith(RUN_ID);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Payroll wasn't approved")).toBeTruthy();
    expect(within(alert).getByText(PENDING_EN)).toBeTruthy();
    // Shown once on the page, not also as a toast; the run stays a draft with its actions.
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(approveButton()).toBeTruthy();
  });

  it("the approve button isn't disabled by client logic: flagged lines (pending penalties) still let it send", async () => {
    const user = userEvent.setup();
    apis.APPROVE_PAYROLL_RUN.mockResolvedValue(PENDING);
    renderRun({ run: run({ lines: [SALMA] }) });
    expect(SALMA.flags).toContain('PENDING_PENALTIES');
    expect((approveButton() as HTMLButtonElement).disabled).toBe(false);
    await user.click(approveButton());
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Approve and lock',
      }),
    );
    expect(apis.APPROVE_PAYROLL_RUN).toHaveBeenCalledTimes(1);
  });

  it('after approve: actions hidden, read-only, bank sheet enabled and payslips linked', async () => {
    const user = userEvent.setup();
    const approved = run({
      status: 'APPROVED',
      approvedAt: '2026-11-30T10:00:00.000Z',
      adjustments: [ADJ_MONA],
    });
    apis.APPROVE_PAYROLL_RUN.mockResolvedValue({
      success: true,
      status: 200,
      data: approved,
    });
    apis.GET_BANK_SHEET.mockResolvedValue({
      success: true,
      status: 200,
      data: {
        fileName: 'bank-sheet-2026-11.xlsx',
        contentType: 'application/xlsx',
        base64: 'UEs=',
      },
    });
    renderRun({ run: run({ adjustments: [ADJ_MONA] }) });

    const bankSheet = screen.getByRole('button', {
      name: 'Export bank sheet',
    }) as HTMLButtonElement;
    expect(bankSheet.disabled).toBe(true);
    expect(table().queryByRole('link', { name: /^Payslip for/ })).toBeNull();

    await user.click(approveButton());
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Approve and lock',
      }),
    );

    await waitFor(() => expect(screen.getByText('Approved')).toBeTruthy());
    expect(toast.success).toHaveBeenCalledWith('Payroll approved.');
    expect(screen.queryByRole('button', { name: 'Approve payroll' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recalculate' })).toBeNull();
    expect(table().getByRole('link', { name: 'Payslip for Mona Khalil' }).getAttribute('href')).toBe(
      `/en/payroll/${RUN_ID}/payslip/${MONA.id}`,
    );

    // Read-only adjustments: the dialog lists them without add or remove.
    await user.click(table().getByRole('button', { name: 'Adjustments for Mona Khalil' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Exam supervision')).toBeTruthy();
    expect(within(dialog).getByText("The run is approved: adjustments can't change.")).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Add adjustment' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /^Remove/ })).toBeNull();
    await user.keyboard('{Escape}');

    const enabled = screen.getByRole('button', {
      name: 'Export bank sheet',
    }) as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
    await user.click(enabled);
    expect(apis.GET_BANK_SHEET).toHaveBeenCalledWith(RUN_ID);
    await waitFor(() =>
      expect(download.saveDownloadedFile).toHaveBeenCalledWith({
        fileName: 'bank-sheet-2026-11.xlsx',
        contentType: 'application/xlsx',
        base64: 'UEs=',
      }),
    );
  });

  it('an approved run opens read-only', () => {
    renderRun({
      run: run({ status: 'APPROVED', approvedAt: '2026-11-30T10:00:00.000Z' }),
    });
    expect(screen.queryByRole('button', { name: 'Approve payroll' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recalculate' })).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: 'Export bank sheet',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(screen.getByText(/Approved 30 Nov 2026/)).toBeTruthy();
  });
});

describe('RunPage — draft', () => {
  it('shows the four tiles from the run totals, net highlighted, and flags on lines that need review', () => {
    renderRun();
    expect(screen.getByText('27,533.33')).toBeTruthy(); // net = 14,000.00 + 13,533.33
    expect(screen.getByText('28,000.00')).toBeTruthy(); // salaries 2 × 14,000
    expect(screen.getByText('1 ready · 1 need review')).toBeTruthy();
    const salmaRow = table().getByText('Salma Adel').closest('tr') as HTMLElement;
    expect(within(salmaRow).getByText('Needs review')).toBeTruthy();
    expect(within(salmaRow).getByText('Pending penalties')).toBeTruthy();
    const monaRow = table().getByText('Mona Khalil').closest('tr') as HTMLElement;
    expect(within(monaRow).getByText('Ready')).toBeTruthy();
  });

  it('recalculate sends once, shows the recalculated run and a toast', async () => {
    const user = userEvent.setup();
    let resolve: (v: unknown) => void = () => undefined;
    apis.RECALCULATE_PAYROLL_RUN.mockReturnValue(new Promise((r) => (resolve = r)));
    renderRun();
    const button = screen.getByRole('button', { name: 'Recalculate' });
    await user.dblClick(button);
    expect(apis.RECALCULATE_PAYROLL_RUN).toHaveBeenCalledTimes(1);
    resolve({ success: true, status: 200, data: run({ lines: [MONA] }) });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Payroll recalculated.'));
    expect(table().queryByText('Salma Adel')).toBeNull();
  });

  it('search, department and "needs review" update the URL without scrolling (the API filters)', async () => {
    const user = userEvent.setup();
    renderRun();
    await user.type(screen.getByRole('searchbox', { name: 'Search employees' }), 'salma');
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/en/payroll/${RUN_ID}?search=salma`, { scroll: false }),
    );

    router.push.mockReset();
    await user.click(screen.getByRole('switch', { name: 'Needs review only' }));
    expect(router.push).toHaveBeenCalledWith(`/en/payroll/${RUN_ID}?flagged=true`, { scroll: false });

    router.push.mockReset();
    await user.click(screen.getByRole('combobox', { name: 'Department' }));
    await user.click(await screen.findByRole('option', { name: 'Science' }));
    expect(router.push).toHaveBeenCalledWith(`/en/payroll/${RUN_ID}?departmentId=d-sci`, { scroll: false });
  });

  it('no lines: "no results" with filters differs from an empty run', async () => {
    const user = userEvent.setup();
    const { unmount } = renderRun({
      run: run({ lines: [] }),
      query: { flagged: true },
    });
    expect(screen.getByText('No employees match')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(router.push).toHaveBeenCalledWith(`/en/payroll/${RUN_ID}`, {
      scroll: false,
    });
    unmount();
    renderRun({ run: run({ lines: [] }) });
    expect(screen.getByText('No employees in this run')).toBeTruthy();
  });

  it('a mutation while filtered keeps the filtered lines and refetches them', async () => {
    const user = userEvent.setup();
    apis.RECALCULATE_PAYROLL_RUN.mockResolvedValue({
      success: true,
      status: 200,
      data: run(),
    });
    renderRun({
      run: run({ lines: [SALMA] }),
      runEmployeeIds: ['e-mona', 'e-salma'],
      query: { search: 'salma' },
    });
    await user.click(screen.getByRole('button', { name: 'Recalculate' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(table().queryByText('Mona Khalil')).toBeNull();
    expect(table().getByText('Salma Adel')).toBeTruthy();
  });

  it('adjustments for employees no longer in the run are listed as "not applied"', () => {
    const gone = {
      ...ADJ_MONA,
      id: 'a-gone',
      employeeId: 'e-gone',
      type: 'DEDUCTION' as const,
      amount: 25_000,
      reason: 'Uniform',
    };
    renderRun({ run: run({ adjustments: [ADJ_MONA, gone] }) });
    const section = screen.getByRole('region', {
      name: 'Adjustments not applied',
    });
    expect(within(section).getByText('Uniform')).toBeTruthy();
    expect(within(section).getByText('Not applied')).toBeTruthy();
    expect(within(section).queryByText('Exam supervision')).toBeNull();
  });

  it('the rules panel shows the live HR settings, or says they failed to load', () => {
    const { unmount } = renderRun();
    const panel = screen.getByRole('complementary', {
      name: 'Rules applied this month',
    });
    expect(within(panel).getByText('1 day = salary for the month ÷ 30')).toBeTruthy();
    expect(within(panel).getByText(/4 days 80% · 3 days 60% · 2 days 40%/)).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Edit in settings' }).getAttribute('href')).toBe('/en/settings');
    unmount();
    renderRun({ settings: null });
    expect(within(screen.getByRole('complementary')).getByRole('alert').textContent).toContain(
      "The HR rules couldn't load",
    );
  });

  it('renders right-to-left in Arabic with Arabic names and labels', () => {
    renderRun({}, 'ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(table().getByText('منى خليل')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'اعتماد الرواتب' })).toBeTruthy();
    expect(screen.getByText('الرواتب · نوفمبر 2026')).toBeTruthy();
  });
});

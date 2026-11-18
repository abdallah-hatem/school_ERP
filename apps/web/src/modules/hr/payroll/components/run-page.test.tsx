// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { chooseRowAction, menuItemNames, openRowActions } from '@/test/row-actions';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
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
import { renderWithI18n, sessionWithout } from '@/test/render';
import { PayrollI18n } from '../messages';
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

function runElement(props: Partial<RunPageProps> = {}, locale: Locale = 'en') {
  return (
    <RunPage
      basePath={`/${locale}/payroll`}
      settingsHref={`/${locale}/settings`}
      penaltiesHref={`/${locale}/penalties`}
      run={props.run ?? run()}
      asOf={0}
      departments={DEPARTMENTS}
      settings={SETTINGS}
      query={{} as PayrollRunQuery}
      {...props}
    />
  );
}

function renderRun(props: Partial<RunPageProps> = {}, locale: Locale = 'en') {
  return renderPayroll(runElement(props, locale), locale);
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

  it.each(['en', 'ar'] as const)(
    '%s: pending penalties are announced before Approve is pressed, with a link to the filtered penalties list',
    (locale) => {
      renderRun({ run: run({ lines: [MONA, SALMA], pendingPenalties: 2 }) }, locale);
      const notice = screen.getByRole('note');
      // The live count from the server (2 penalties), not the flagged lines (1).
      expect(notice.textContent).toContain(
        locale === 'en' ? 'Pending penalties dated this month: 2.' : 'جزاءات معلّقة بتاريخ هذا الشهر: 2.',
      );
      const link = within(notice).getByRole('link');
      expect(link.getAttribute('href')).toBe(`/${locale}/penalties?month=2026-11&status=PENDING`);
      // A notice, not a block: the button is still there to press.
      expect(
        (screen.getByRole('button', { name: locale === 'en' ? 'Approve payroll' : /اعتماد الرواتب/ }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    },
  );

  it('pending penalties approved since the last calculation: no stale count, a recalculate hint that recalculates', async () => {
    const user = userEvent.setup();
    apis.RECALCULATE_PAYROLL_RUN.mockResolvedValue({
      success: true,
      asOf: 1,
      data: run({ lines: [MONA, { ...SALMA, flags: [] }], pendingPenalties: 0 }),
    });
    renderRun({ run: run({ lines: [MONA, SALMA], pendingPenalties: 0 }) });
    const hint = screen.getByRole('note');
    expect(hint.textContent).not.toContain('Pending penalties dated this month');
    expect(hint.textContent).toContain('Penalties changed since the last calculation');
    await user.click(within(hint).getByRole('button', { name: 'Recalculate now' }));
    expect(apis.RECALCULATE_PAYROLL_RUN).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('note')).toBeNull());
  });

  it('a penalty recorded since the last calculation: the live count shows even with no flagged line', () => {
    renderRun({ run: run({ lines: [MONA], pendingPenalties: 1 }) });
    expect(screen.getByRole('note').textContent).toContain('Pending penalties dated this month: 1.');
  });

  it('no pending-penalties notice when no line is flagged, nor on an approved run', () => {
    const { unmount } = renderRun({ run: run({ lines: [MONA] }) });
    expect(screen.queryByRole('note')).toBeNull();
    unmount();
    renderRun({ run: run({ lines: [SALMA], status: 'APPROVED', approvedAt: '2026-11-30T10:00:00.000Z' }) });
    expect(screen.queryByRole('note')).toBeNull();
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
      asOf: 1,
      status: 200,
      data: approved,
    });
    apis.GET_BANK_SHEET.mockResolvedValue({
      success: true,
      asOf: 1,
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
    // Draft: the ⋯ offers Adjust only (no payslip yet).
    expect(menuItemNames(await openRowActions(user, 'Mona Khalil', table()))).toEqual(['Adjust']);
    await user.keyboard('{Escape}');

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
    // Approved: no Adjust; the recorded adjustments stay viewable, and the payslip is linked.
    const menu = await openRowActions(user, 'Mona Khalil', table());
    expect(menuItemNames(menu)).toEqual(['Adjustments', 'Payslip']);
    expect(within(menu).getByRole('menuitem', { name: 'Payslip' }).getAttribute('href')).toBe(
      `/en/payroll/${RUN_ID}/payslip/${MONA.id}`,
    );
    await user.keyboard('{Escape}');

    // Read-only adjustments: the dialog lists them without add or remove.
    await chooseRowAction(user, 'Mona Khalil', /^Adjustments/, table());
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

  it('a draft without hr.payroll.adjust: recorded adjustments viewable (no add or remove, says why); none recorded → no menu', async () => {
    const user = userEvent.setup();
    renderWithI18n(<PayrollI18n locale="en">{runElement({ run: run({ adjustments: [ADJ_MONA] }) }, 'en')}</PayrollI18n>, {
      session: sessionWithout('hr.payroll.adjust'),
    });
    expect(menuItemNames(await openRowActions(user, 'Mona Khalil', table()))).toEqual(['Adjustments']);
    await user.keyboard('{Escape}');
    await chooseRowAction(user, 'Mona Khalil', /^Adjustments/, table());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Exam supervision')).toBeTruthy();
    expect(
      within(dialog).getByText('You can view these adjustments. Changing them needs the Adjust payroll permission.'),
    ).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Add adjustment' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /^Remove/ })).toBeNull();
    await user.keyboard('{Escape}');
    // Salma has no adjustments: nothing to view, nothing to add — no ⋯ at all.
    expect(table().queryByRole('button', { name: /^Actions for Salma/ })).toBeNull();
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

  it("each employee's name opens their profile; the code and department stay plain text", () => {
    renderRun();
    const salma = table().getByRole('link', { name: 'Salma Adel' });
    expect(salma.getAttribute('href')).toBe('/en/employees/e-salma');
    expect(table().getByText('EMP-0002').closest('a')).toBeNull();
  });

  it('recalculate sends once, shows the recalculated run and a toast', async () => {
    const user = userEvent.setup();
    let resolve: (v: unknown) => void = () => undefined;
    apis.RECALCULATE_PAYROLL_RUN.mockReturnValue(new Promise((r) => (resolve = r)));
    renderRun();
    const button = screen.getByRole('button', { name: 'Recalculate' });
    await user.dblClick(button);
    expect(apis.RECALCULATE_PAYROLL_RUN).toHaveBeenCalledTimes(1);
    resolve({ success: true, asOf: 1, status: 200, data: run({ lines: [MONA] }) });
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
    // The toolbar's and the "No results" one.
    const clears = screen.getAllByRole('button', { name: 'Clear filters · 1' });
    expect(clears).toHaveLength(2);
    router.push.mockClear();
    await user.click(clears[1]!);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(`/en/payroll/${RUN_ID}`, {
      scroll: false,
    });
    unmount();
    renderRun({ run: run({ lines: [] }) });
    expect(screen.getByText('No employees in this run')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
  });

  it('a mutation while filtered keeps the filtered lines and refetches them', async () => {
    const user = userEvent.setup();
    apis.RECALCULATE_PAYROLL_RUN.mockResolvedValue({
      success: true,
      asOf: 1,
      status: 200,
      data: run(),
    });
    renderRun({
      run: run({ lines: [SALMA] }),
      query: { search: 'salma' },
    });
    await user.click(screen.getByRole('button', { name: 'Recalculate' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(table().queryByText('Mona Khalil')).toBeNull();
    expect(table().getByText('Salma Adel')).toBeTruthy();
  });

  it('adjustments the API marks applied: false are listed as "not applied", naming the employee', () => {
    const gone = {
      ...ADJ_MONA,
      id: 'a-gone',
      employeeId: 'e-gone',
      employeeCode: 'EMP-0042',
      nameEn: 'Karim Fawzy',
      nameAr: 'كريم فوزي',
      type: 'DEDUCTION' as const,
      amount: 25_000,
      reason: 'Uniform',
      applied: false,
    };
    // Filtered to one line: an applied adjustment of an employee outside the filter stays applied.
    renderRun({ run: run({ lines: [SALMA], adjustments: [ADJ_MONA, gone] }), query: { search: 'salma' } });
    const section = screen.getByRole('region', {
      name: 'Adjustments not applied',
    });
    expect(within(section).getByText('Uniform')).toBeTruthy();
    expect(within(section).getByText('Not applied')).toBeTruthy();
    const goneLine = within(section).getByRole('link', { name: 'Karim Fawzy (EMP-0042)' });
    // The name opens the employee's profile, inside the sentence.
    expect(goneLine.getAttribute('href')).toBe('/en/employees/e-gone');
    expect(goneLine.parentElement?.textContent).toBe('Not applied — Karim Fawzy (EMP-0042) is no longer in this run');
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

  it('on an APPROVED run the rules panel is labelled as today\'s rules, with when the run was calculated', () => {
    renderRun({
      run: run({ status: 'APPROVED', approvedAt: '2026-11-30T10:00:00.000Z' }),
    });
    expect(screen.queryByRole('complementary', { name: 'Rules applied this month' })).toBeNull();
    const panel = screen.getByRole('complementary', { name: 'Current rules' });
    expect(within(panel).getByText(/This run was calculated on 30 Nov 2026/)).toBeTruthy();
    expect(within(panel).getByText(/may differ from the ones it used/)).toBeTruthy();
  });

  it('renders right-to-left in Arabic with Arabic names and labels', () => {
    renderRun({}, 'ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(table().getByText('منى خليل')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'اعتماد الرواتب' })).toBeTruthy();
    expect(screen.getByText('الرواتب · نوفمبر 2026')).toBeTruthy();
  });
});

// A navigation started before a mutation (debounced search, "Clear filters") can land after it with
// props read before the write. The mutation's result must stay on screen.
describe('RunPage — a navigation landing after a mutation', () => {
  const APPROVED = run({ status: 'APPROVED', approvedAt: '2026-11-30T10:00:00.000Z' });
  const rerenderWith = (rerender: (ui: ReactElement) => void, props: Partial<RunPageProps>) =>
    rerender(<PayrollI18n locale="en">{runElement(props)}</PayrollI18n>);

  it('props read before Approve answered (the run still a draft) never bring Draft and Recalculate back', async () => {
    const user = userEvent.setup();
    apis.APPROVE_PAYROLL_RUN.mockResolvedValue({ success: true, status: 200, data: APPROVED, asOf: 200 });
    const { rerender } = renderRun({ asOf: 100 });
    await user.click(approveButton());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve and lock' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Recalculate' })).toBeNull());

    // The clear-search navigation lands now: read at 150, before the approve answered at 200.
    rerenderWith(rerender, { run: run(), asOf: 150 });
    expect(screen.queryByRole('button', { name: 'Recalculate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve payroll' })).toBeNull();
    expect(screen.queryByText('Draft')).toBeNull();
    // The page re-reads the current URL instead of trusting the old render.
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));

    // That re-read (after the write) is accepted.
    rerenderWith(rerender, { run: run({ ...APPROVED, lines: [MONA] }), asOf: 300 });
    expect(table().queryByText('Salma Adel')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recalculate' })).toBeNull();
  });

  it('a recalculation is not undone by a render read before it; a newer render replaces it', async () => {
    const user = userEvent.setup();
    apis.RECALCULATE_PAYROLL_RUN.mockResolvedValue({
      success: true,
      status: 200,
      data: run({ lines: [MONA] }),
      asOf: 200,
    });
    const { rerender } = renderRun({ asOf: 100 });
    await user.click(screen.getByRole('button', { name: 'Recalculate' }));
    await waitFor(() => expect(table().queryByText('Salma Adel')).toBeNull());

    rerenderWith(rerender, { run: run(), asOf: 199 });
    expect(table().queryByText('Salma Adel')).toBeNull();

    rerenderWith(rerender, { run: run(), asOf: 201 });
    expect(table().getByText('Salma Adel')).toBeTruthy();
  });

  it('a search typed just before Recalculate waits for it, then navigates; the toolbar is locked meanwhile', async () => {
    const user = userEvent.setup();
    let resolve: (v: unknown) => void = () => undefined;
    apis.RECALCULATE_PAYROLL_RUN.mockReturnValue(new Promise((r) => (resolve = r)));
    renderRun();
    const searchbox = screen.getByRole('searchbox', { name: 'Search employees' }) as HTMLInputElement;
    await user.type(searchbox, 'salma');
    await user.click(screen.getByRole('button', { name: 'Recalculate' }));
    expect(searchbox.disabled).toBe(true);
    expect((screen.getByRole('switch', { name: 'Needs review only' }) as HTMLButtonElement).disabled).toBe(true);
    // Past the debounce: nothing navigates while the write is in flight.
    await new Promise((r) => setTimeout(r, 400));
    expect(router.push).not.toHaveBeenCalled();

    resolve({ success: true, status: 200, data: run(), asOf: 1 });
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/en/payroll/${RUN_ID}?search=salma`, { scroll: false }),
    );
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(searchbox.disabled).toBe(false);
  });
});

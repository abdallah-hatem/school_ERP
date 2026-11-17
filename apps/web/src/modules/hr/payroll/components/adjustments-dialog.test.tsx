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

import { ADJ_MONA, MONA, renderPayroll, run, RUN_ID, SETTINGS } from '../test/fixtures';
import { RunPage } from './run-page';

function renderRun(r = run()) {
  return renderPayroll(
    <RunPage
      basePath="/en/payroll"
      settingsHref="/en/settings"
      run={r}
      runEmployeeIds={r.lines.map((l) => l.employeeId)}
      departments={[]}
      settings={SETTINGS}
      query={{}}
    />,
  );
}

async function openFor(name: string) {
  const user = userEvent.setup();
  const tableEl = document.querySelector<HTMLElement>('[data-view="table"]')!;
  await user.click(within(tableEl).getByRole('button', { name: `Adjustments for ${name}` }));
  return { user, dialog: await screen.findByRole('dialog') };
}

beforeEach(() => {
  for (const fn of [...Object.values(apis), toast.error, toast.success]) fn.mockReset();
});
afterEach(cleanup);

describe('Adjustments dialog', () => {
  it("lists only that employee's adjustments", async () => {
    const other = {
      ...ADJ_MONA,
      id: 'a-2',
      employeeId: 'e-salma',
      reason: 'Overtime',
    };
    renderRun(run({ adjustments: [ADJ_MONA, other] }));
    const { dialog } = await openFor('Mona Khalil');
    expect(within(dialog).getByText('Exam supervision')).toBeTruthy();
    expect(within(dialog).queryByText('Overtime')).toBeNull();
  });

  it('amount and reason are required: translated messages, nothing sent', async () => {
    renderRun();
    const { user, dialog } = await openFor('Mona Khalil');
    await user.click(within(dialog).getByRole('button', { name: 'Add adjustment' }));
    expect(await within(dialog).findByText('Enter an amount above 0.')).toBeTruthy();
    expect(within(dialog).getByText('Enter a reason.')).toBeTruthy();
    expect(apis.ADD_PAYROLL_ADJUSTMENT).not.toHaveBeenCalled();
  });

  it('adds a deduction in piastres with its reason; the recalculated run replaces the page data', async () => {
    const updated = run({
      adjustments: [
        {
          ...ADJ_MONA,
          id: 'a-new',
          type: 'DEDUCTION',
          amount: 125_050,
          reason: 'Lost book',
        },
      ],
      lines: [{ ...MONA, adjustmentDeductions: 125_050, net: MONA.net - 125_050 }],
    });
    apis.ADD_PAYROLL_ADJUSTMENT.mockResolvedValue({
      success: true,
      status: 201,
      data: updated,
    });
    renderRun();
    const { user, dialog } = await openFor('Mona Khalil');

    await user.click(within(dialog).getByRole('combobox', { name: /Type/ }));
    await user.click(await screen.findByRole('option', { name: 'Deduction' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Amount/ }), '1,250.5');
    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), '  Lost book ');
    await user.click(within(dialog).getByRole('button', { name: 'Add adjustment' }));

    await waitFor(() =>
      expect(apis.ADD_PAYROLL_ADJUSTMENT).toHaveBeenCalledWith(RUN_ID, {
        employeeId: 'e-mona',
        type: 'DEDUCTION',
        amount: 125_050,
        reason: 'Lost book',
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Adjustment added.');
    expect(await within(dialog).findByText('Lost book')).toBeTruthy();
    const tableEl = document.querySelector<HTMLElement>('[data-view="table"]')!;
    expect(within(tableEl).getByText('-1,250.50')).toBeTruthy();
  });

  it('double-clicking Add sends one request', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    apis.ADD_PAYROLL_ADJUSTMENT.mockReturnValue(new Promise((r) => (resolve = r)));
    renderRun();
    const { user, dialog } = await openFor('Mona Khalil');
    await user.type(within(dialog).getByRole('textbox', { name: /Amount/ }), '100');
    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Overtime');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Add adjustment' }));
    await waitFor(() => expect(apis.ADD_PAYROLL_ADJUSTMENT).toHaveBeenCalledTimes(1));
    resolve({ success: true, status: 201, data: run() });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(apis.ADD_PAYROLL_ADJUSTMENT).toHaveBeenCalledTimes(1);
  });

  it('removes an adjustment on a draft', async () => {
    apis.REMOVE_PAYROLL_ADJUSTMENT.mockResolvedValue({
      success: true,
      status: 200,
      data: run(),
    });
    renderRun(run({ adjustments: [ADJ_MONA] }));
    const { user, dialog } = await openFor('Mona Khalil');
    await user.click(within(dialog).getByRole('button', { name: 'Remove Addition of 500.00' }));
    expect(apis.REMOVE_PAYROLL_ADJUSTMENT).toHaveBeenCalledWith(RUN_ID, 'a-1');
    expect(await within(dialog).findByText('No adjustments for this employee this month.')).toBeTruthy();
  });

  it('a server error (approved meanwhile) keeps the form and toasts the message', async () => {
    apis.ADD_PAYROLL_ADJUSTMENT.mockResolvedValue({
      success: false,
      status: 409,
      error: 'PAYROLL_APPROVED',
      message: "This month's payroll is approved and locked.",
    });
    renderRun();
    const { user, dialog } = await openFor('Mona Khalil');
    await user.type(within(dialog).getByRole('textbox', { name: /Amount/ }), '100');
    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Overtime');
    await user.click(within(dialog).getByRole('button', { name: 'Add adjustment' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This month's payroll is approved and locked."));
    expect(
      (
        within(dialog).getByRole('textbox', {
          name: /Reason/,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('Overtime');
  });
});

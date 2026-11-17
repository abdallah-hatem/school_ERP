// @vitest-environment jsdom
import { formatDayCount, latenessDays, SETTING_DEFAULTS, type LatenessRule, type LatenessRow } from '@school-erp/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
const apis = vi.hoisted(() => ({ PUT_LATENESS: vi.fn() }));
vi.mock('./apis', () => apis);

import type { Locale } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { renderWithI18n } from '@/test/render';
import { LatenessBoard, type LatenessBoardProps } from './lateness-board';
import { latenessMessages } from './lateness-screen';

const DEFAULT_RULE: LatenessRule = {
  graceMinutes: SETTING_DEFAULTS['hr.lateness.graceMinutes'],
  steps: SETTING_DEFAULTS['hr.lateness.steps'],
  extraHourDays: SETTING_DEFAULTS['hr.lateness.extraHourDays'],
};

const DEPARTMENT = { id: 'd1', nameEn: 'Science', nameAr: 'العلوم' };
const OTHER_DEPARTMENT = { id: 'd2', nameEn: 'Languages', nameAr: 'اللغات' };

function row(id: string, code: string, nameEn: string, nameAr: string, minutes = 0, department = DEPARTMENT): LatenessRow {
  return {
    employee: { id, code, nameEn, nameAr },
    department,
    minutes,
    days: latenessDays(minutes, DEFAULT_RULE),
  };
}

const ROWS = [
  row('e1', 'EMP-0001', 'Mona Adel', 'منى عادل', 30),
  row('e2', 'EMP-0002', 'Karim Fawzy', 'كريم فوزي', 0, OTHER_DEPARTMENT),
  row('e3', 'EMP-0003', 'Salma Nour', 'سلمى نور', 90),
];

function renderBoard(props: Partial<LatenessBoardProps> = {}, locale: Locale = 'en') {
  const ui: ReactElement = (
    <I18nProvider messages={latenessMessages(locale)}>
      <LatenessBoard
        month="2026-11"
        maxMonth="2026-11"
        rows={ROWS}
        rule={DEFAULT_RULE}
        locked={false}
        {...props}
      />
    </I18nProvider>
  );
  return renderWithI18n(ui, { locale });
}

/** The table and the phone cards both render in jsdom (container queries); act on the table. */
function table() {
  const el = document.querySelector<HTMLElement>('[data-view="table"]');
  if (!el) throw new Error('table view not rendered');
  return within(el);
}

function minutesInput(name: string) {
  return table().getByRole('textbox', { name: `Minutes for ${name}` });
}

function daysOf(id: string) {
  return table().getByTestId(`days-${id}`).textContent;
}

function saveButton() {
  return screen.getByRole('button', { name: /^Save all/ });
}

beforeEach(() => {
  apis.PUT_LATENESS.mockReset();
  router.push.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(cleanup);

describe('LatenessBoard', () => {
  it('days column updates while typing', async () => {
    const user = userEvent.setup();
    renderBoard();
    expect(daysOf('e2')).toBe('0 days');
    const input = minutesInput('Karim Fawzy');
    await user.clear(input);
    await user.type(input, '61');
    expect(daysOf('e2')).toBe('0.75 day');
    await user.type(input, '0');
    // 610 minutes → 11 hours: 0.25 + 0.5 + 9 × 0.5
    expect(daysOf('e2')).toBe('5.25 days');
  });

  it('the live "days" preview uses the shared latenessDays with the rule from HR settings (no second copy of the rule)', async () => {
    const user = userEvent.setup();
    const rule: LatenessRule = { graceMinutes: 15, steps: [{ hour: 1, days: 1 }], extraHourDays: 0.25 };
    renderBoard({ rule });
    const input = minutesInput('Karim Fawzy');
    for (const minutes of [10, 16, 75, 76, 200]) {
      await user.clear(input);
      await user.type(input, String(minutes));
      expect(daysOf('e2')).toBe(formatDayCount(latenessDays(minutes, rule), 'en'));
    }
  });

  it('minutes over 6,000 are highlighted and block Save all', async () => {
    const user = userEvent.setup();
    renderBoard();
    const input = minutesInput('Karim Fawzy');
    for (const bad of ['6001', '12000']) {
      await user.clear(input);
      await user.type(input, bad);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(table().getByText('Whole minutes from 0 to 6,000.')).toBeTruthy();
      expect(daysOf('e2')).toBe('—');
      expect((saveButton() as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);
    }
    await user.clear(input);
    await user.type(input, '6000');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(daysOf('e2')).toBe('49.75 days');
    expect((saveButton() as HTMLButtonElement | HTMLInputElement).disabled).toBe(false);
  });

  it('minutes group live while typing; a minus, a dot and letters are ignored, so only whole minutes reach the grid', async () => {
    const user = userEvent.setup();
    renderBoard();
    const input = minutesInput('Karim Fawzy') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '1500');
    expect(input.value).toBe('1,500');
    // 1,500 minutes = 25 hours: the live days preview reads the grouped text.
    expect(daysOf('e2')).toBe(formatDayCount(latenessDays(1500, DEFAULT_RULE), 'en'));
    await user.clear(input);
    await user.type(input, '-1.5a');
    expect(input.value).toBe('15');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('an invalid-minutes error stays beside the input: the field names it, and its icon opens the message', async () => {
    const user = userEvent.setup();
    renderBoard();
    const input = minutesInput('Karim Fawzy');
    await user.clear(input);
    await user.type(input, '6001');
    const describedBy = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(describedBy?.textContent).toBe('Whole minutes from 0 to 6,000.');
    // No message block under the input (the row keeps its height); the icon opens it instead.
    expect(input.closest('td')?.querySelectorAll('p')).toHaveLength(0);
    await user.click(table().getByRole('button', { name: 'Whole minutes from 0 to 6,000.' }));
    expect((await screen.findByRole('dialog')).textContent).toBe('Whole minutes from 0 to 6,000.');
  });

  it('Save all sends only the changed rows and shows a translated success toast', async () => {
    const user = userEvent.setup();
    const saved = [ROWS[0]!, row('e2', 'EMP-0002', 'Karim Fawzy', 'كريم فوزي', 45), ROWS[2]!];
    apis.PUT_LATENESS.mockResolvedValue({ success: true, status: 200, message: 'Resource updated successfully', data: { locked: false, rows: saved } });
    renderBoard();
    expect((saveButton() as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);

    await user.clear(minutesInput('Karim Fawzy'));
    await user.type(minutesInput('Karim Fawzy'), '45');
    // Typed back to its saved value: not a change.
    await user.clear(minutesInput('Mona Adel'));
    await user.type(minutesInput('Mona Adel'), '30');
    await user.click(screen.getByRole('button', { name: 'Save all (1)' }));

    expect(apis.PUT_LATENESS).toHaveBeenCalledTimes(1);
    expect(apis.PUT_LATENESS).toHaveBeenCalledWith('2026-11', { entries: [{ employeeId: 'e2', minutes: 45 }] });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Lateness saved.'));
    expect(screen.getByRole('button', { name: 'Save all' })).toBeTruthy();
    expect((saveButton() as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);
  });

  it('double-clicking Save all sends one request', async () => {
    const user = userEvent.setup();
    let resolve: (v: unknown) => void = () => undefined;
    apis.PUT_LATENESS.mockReturnValue(new Promise((r) => (resolve = r)));
    renderBoard();
    await user.type(minutesInput('Karim Fawzy'), '5');
    const button = saveButton();
    await user.dblClick(button);
    expect(apis.PUT_LATENESS).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);
    resolve({ success: true, status: 200, data: { locked: false, rows: ROWS } });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('locked (read-only) when the month\'s payroll is approved: a 409 PAYROLL_APPROVED shows the banner and disables entry', async () => {
    const user = userEvent.setup();
    apis.PUT_LATENESS.mockResolvedValue({
      success: false,
      status: 409,
      error: 'PAYROLL_APPROVED',
      message: "This month's payroll is approved and locked.",
    });
    renderBoard();
    await user.clear(minutesInput('Karim Fawzy'));
    await user.type(minutesInput('Karim Fawzy'), '20');
    await user.click(saveButton());

    const banner = await screen.findByRole('alert');
    expect(within(banner).getByText('This month is locked')).toBeTruthy();
    expect(within(banner).getByText(/November 2026/)).toBeTruthy();
    expect((minutesInput('Karim Fawzy') as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);
    // The unsaved edit is dropped: the saved value is shown again.
    expect((minutesInput('Karim Fawzy') as HTMLInputElement).value).toBe('0');
    expect(screen.queryByRole('button', { name: /^Save all/ })).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("This month's payroll is approved and locked.");
  });

  it('a month that loads locked opens read-only with the banner, before any save', () => {
    renderBoard({ locked: true });
    const banner = screen.getByRole('alert');
    expect(within(banner).getByText('This month is locked')).toBeTruthy();
    expect(within(banner).getByText(/November 2026/)).toBeTruthy();
    expect((minutesInput('Karim Fawzy') as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /^Save all/ })).toBeNull();
    expect(apis.PUT_LATENESS).not.toHaveBeenCalled();
  });

  it('an open month shows no lock banner and stays editable', () => {
    renderBoard({ locked: false });
    expect(screen.queryByRole('alert')).toBeNull();
    expect((minutesInput('Karim Fawzy') as HTMLButtonElement | HTMLInputElement).disabled).toBe(false);
  });

  it('each row shows its own department from the lateness row (no separate lookup)', () => {
    renderBoard();
    const rowOf = (name: string) => minutesInput(name).closest('tr') as HTMLElement;
    expect(within(rowOf('Mona Adel')).getByText('Science')).toBeTruthy();
    expect(within(rowOf('Karim Fawzy')).getByText('Languages')).toBeTruthy();
  });

  it('another save error keeps the edits and the page editable', async () => {
    const user = userEvent.setup();
    apis.PUT_LATENESS.mockResolvedValue({ success: false, status: 409, error: 'EMPLOYEE_INACTIVE', message: 'Inactive' });
    renderBoard();
    await user.type(minutesInput('Karim Fawzy'), '7');
    await user.click(saveButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Inactive'));
    expect((minutesInput('Karim Fawzy') as HTMLInputElement).value).toBe('7');
    expect((minutesInput('Karim Fawzy') as HTMLButtonElement | HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the summary totals the month live: minutes and days', async () => {
    const user = userEvent.setup();
    renderBoard();
    // 30 → 0.25, 0, 90 → 0.75
    expect(screen.getByTestId('lateness-summary').textContent).toBe('3 employees · 120 minutes · 1 day');
    await user.clear(minutesInput('Karim Fawzy'));
    await user.type(minutesInput('Karim Fawzy'), '1500');
    // + 1,500 → 25 hours: 0.25 + 0.5 + 23 × 0.5 = 12.25
    expect(screen.getByTestId('lateness-summary').textContent).toBe('3 employees · 1,620 minutes · 13.25 days');
  });

  it('search filters by name or code; no match shows a no-results state', async () => {
    const user = userEvent.setup();
    renderBoard();
    const search = screen.getByRole('searchbox', { name: 'Search employees' });
    await user.type(search, 'emp-0003');
    expect(table().queryByRole('textbox', { name: 'Minutes for Mona Adel' })).toBeNull();
    expect(minutesInput('Salma Nour')).toBeTruthy();
    await user.clear(search);
    await user.type(search, 'karim');
    expect(minutesInput('Karim Fawzy')).toBeTruthy();
    expect(table().queryByRole('textbox', { name: 'Minutes for Salma Nour' })).toBeNull();
    await user.clear(search);
    await user.type(search, 'nobody');
    expect(screen.getByText('No employees match')).toBeTruthy();
    // The toolbar's and the "No results" "Clear filters · 1": either brings every row back.
    const clears = screen.getAllByRole('button', { name: 'Clear filters · 1' });
    expect(clears).toHaveLength(2);
    await user.click(clears[1]!);
    expect((search as HTMLInputElement).value).toBe('');
    expect(minutesInput('Mona Adel')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
  });

  it('an edit survives filtering it out of view and is still saved', async () => {
    const user = userEvent.setup();
    apis.PUT_LATENESS.mockResolvedValue({ success: true, status: 200, data: { locked: false, rows: ROWS } });
    renderBoard();
    await user.type(minutesInput('Karim Fawzy'), '9');
    await user.type(screen.getByRole('searchbox', { name: 'Search employees' }), 'Salma');
    await user.click(saveButton());
    expect(apis.PUT_LATENESS).toHaveBeenCalledWith('2026-11', { entries: [{ employeeId: 'e2', minutes: 9 }] });
  });

  it('empty month and failed load show their own states', async () => {
    const user = userEvent.setup();
    const { unmount } = renderBoard({ rows: [] });
    expect(screen.getByText('No active employees')).toBeTruthy();
    unmount();
    renderBoard({ rows: null });
    expect(screen.getByRole('alert')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('a missing rule shows a warning and no days, but minutes can still be saved', async () => {
    const user = userEvent.setup();
    renderBoard({ rule: null });
    expect(screen.getByRole('alert').textContent).toContain("The lateness rule couldn't load");
    expect(daysOf('e1')).toBe('—');
    await user.type(minutesInput('Karim Fawzy'), '5');
    expect((saveButton() as HTMLButtonElement | HTMLInputElement).disabled).toBe(false);
  });

  it('switching month with unsaved edits asks first; without edits it navigates without scrolling', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(router.push).toHaveBeenCalledWith('?month=2026-10', { scroll: false });
    expect((screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);

    router.push.mockReset();
    await user.type(minutesInput('Karim Fawzy'), '5');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(router.push).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Discard and switch' }));
    expect(router.push).toHaveBeenCalledWith('?month=2026-10', { scroll: false });
  });

  it('Arabic day counts agree with the number (يومان, 3 أيام, 11 يومًا, 0.5 يوم), Western digits', async () => {
    const user = userEvent.setup();
    // One day per started hour after a 0-minute grace, half a day for the first.
    const rule: LatenessRule = { graceMinutes: 0, steps: [{ hour: 1, days: 0.5 }, { hour: 2, days: 1.5 }], extraHourDays: 1 };
    renderBoard({ rule }, 'ar');
    const input = table().getByRole('textbox', { name: 'دقائق كريم فوزي' });
    const expectDays = async (minutes: string, text: string) => {
      await user.clear(input);
      await user.type(input, minutes);
      expect(daysOf('e2')).toBe(text);
    };
    await expectDays('30', '0.5 يوم');
    await expectDays('61', 'يومان');
    await expectDays('121', '3 أيام');
    await expectDays('481', '9 أيام');
    await expectDays('541', '10 أيام');
    await expectDays('601', '11 يومًا');
  });

  it('renders right-to-left in Arabic with Arabic names and departments', () => {
    renderBoard({}, 'ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(table().getByRole('textbox', { name: 'دقائق كريم فوزي' })).toBeTruthy();
    expect(table().getAllByText('العلوم')).toHaveLength(2);
    expect(table().getByText('اللغات')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'حفظ الكل' }) as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);
  });
});

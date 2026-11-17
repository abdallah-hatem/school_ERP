// @vitest-environment jsdom
import '@/test/dom-polyfills';
import type { PenaltyPreview } from '@school-erp/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const apis = vi.hoisted(() => ({ GET_PENALTY_PREVIEW: vi.fn(), CREATE_PENALTY: vi.fn() }));
vi.mock('../apis', () => apis);

import { todayIso } from '@/shared/lib/format';
import { employeeOptions, violationGroups } from '../lib/penalty-text';
import { failure, groups, ok, record, renderPenalties } from '../test/fixtures';
import { RecordPenaltyDialog } from './record-penalty-dialog';

const EMPLOYEES = employeeOptions(
  [
    { id: 'e-mona', code: 'EMP-0001', nameEn: 'Mona Khalil', nameAr: 'منى خليل', status: 'ACTIVE' },
    { id: 'e-omar', code: 'EMP-0002', nameEn: 'Omar Fathy', nameAr: 'عمر فتحي', status: 'ACTIVE' },
  ],
  'en',
);

const preview = (overrides: Partial<PenaltyPreview> = {}): PenaltyPreview => ({
  level: 1,
  action: 'NOTICE',
  days: null,
  priorCount: 0,
  ...overrides,
});

function renderDialog(onOpenChange = vi.fn(), locale: 'en' | 'ar' = 'en') {
  renderPenalties(
    <RecordPenaltyDialog
      open
      onOpenChange={onOpenChange}
      employees={EMPLOYEES}
      violations={violationGroups(groups, locale)}
    />,
    locale,
  );
  return onOpenChange;
}

async function choose(user: ReturnType<typeof userEvent.setup>, field: RegExp, option: string) {
  await user.click(screen.getByRole('combobox', { name: field }));
  await user.click(await screen.findByRole('option', { name: option }));
}

const previewLine = () => screen.getByTestId('penalty-preview').textContent;

describe('RecordPenaltyDialog', () => {
  beforeEach(() => {
    router.refresh.mockReset();
    apis.GET_PENALTY_PREVIEW.mockReset();
    apis.CREATE_PENALTY.mockReset();
  });
  afterEach(cleanup);

  it('Preview updates when employee, violation or date changes', async () => {
    const user = userEvent.setup();
    apis.GET_PENALTY_PREVIEW.mockImplementation(({ employeeId, date }: { employeeId: string; date: string }) =>
      Promise.resolve(
        ok(
          employeeId === 'e-omar'
            ? preview({ level: 3, action: 'DEDUCT_DAYS', days: 2, priorCount: 2 })
            : date === todayIso()
              ? preview({ level: 2, action: 'DEDUCT_DAYS', days: 0.5, priorCount: 1 })
              : preview(),
        ),
      ),
    );
    renderDialog();

    // Nothing asked until employee, violation and date are all set (the date defaults to today).
    expect(previewLine()).toBe('Choose the employee, violation and date to see the level and action.');
    await choose(user, /Employee/, 'Mona Khalil · EMP-0001');
    expect(apis.GET_PENALTY_PREVIEW).not.toHaveBeenCalled();

    await choose(user, /Violation/, 'Late arrival without notice');
    await waitFor(() => expect(previewLine()).toBe('Level 2 — Deduct 0.5 day'));
    expect(apis.GET_PENALTY_PREVIEW).toHaveBeenLastCalledWith({ employeeId: 'e-mona', violationId: 'v-late', date: todayIso() });
    expect(screen.getByText('1 earlier approved penalty for this violation in the repetition window.')).toBeTruthy();

    // Employee changes → asked again for the other employee.
    await choose(user, /Employee/, 'Omar Fathy · EMP-0002');
    await waitFor(() => expect(previewLine()).toBe('Level 3 — Deduct 2 days'));

    // Violation changes.
    await choose(user, /Employee/, 'Mona Khalil · EMP-0001');
    await choose(user, /Violation/, 'Using a phone in class');
    await waitFor(() =>
      expect(apis.GET_PENALTY_PREVIEW).toHaveBeenLastCalledWith({ employeeId: 'e-mona', violationId: 'v-phone', date: todayIso() }),
    );

    // Date changes: the 15th of last month.
    await user.click(screen.getByRole('button', { name: /Date of the violation/ }));
    await user.click(await screen.findByRole('button', { name: 'Previous month' }));
    await user.click(within(screen.getByRole('grid')).getByRole('button', { name: /\b15\b/ }));
    await waitFor(() => expect(previewLine()).toBe('Level 1 — Notice'));
    const lastCall = apis.GET_PENALTY_PREVIEW.mock.lastCall?.[0] as { date: string };
    expect(lastCall.date).toMatch(/^\d{4}-\d{2}-15$/);
    expect(lastCall.date < todayIso()).toBe(true);
  });

  it('the employee picker searches active employees by Arabic name or code and picks with the keyboard', async () => {
    const user = userEvent.setup();
    apis.GET_PENALTY_PREVIEW.mockResolvedValue(ok(preview()));
    renderPenalties(
      <RecordPenaltyDialog
        open
        onOpenChange={vi.fn()}
        employees={employeeOptions(
          [
            { id: 'e-mona', code: 'EMP-0001', nameEn: 'Mona Khalil', nameAr: 'منى خليل', status: 'ACTIVE' },
            { id: 'e-omar', code: 'EMP-0002', nameEn: 'Omar Fathy', nameAr: 'عمر فتحي', status: 'ACTIVE' },
            { id: 'e-gone', code: 'EMP-0003', nameEn: 'Omar Gone', nameAr: 'عمر سابق', status: 'INACTIVE' },
          ],
          'en',
        )}
        violations={violationGroups(groups, 'en')}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: /Employee/ }));
    const search = screen.getByRole('searchbox', { name: /Type a name/ });
    await user.type(search, 'عمر');
    // The inactive one is never offered.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Omar Fathy · EMP-0002']);
    await user.clear(search);
    await user.type(search, '0001{Enter}');
    expect(screen.getByRole('combobox', { name: /Employee/ }).textContent).toBe('Mona Khalil · EMP-0001');
  });

  it('a slower, older preview answer never replaces the latest one', async () => {
    const user = userEvent.setup();
    let resolveFirst: (v: unknown) => void = () => undefined;
    apis.GET_PENALTY_PREVIEW.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r))).mockResolvedValue(
      ok(preview({ level: 4, action: 'DISMISSAL' })),
    );
    renderDialog();
    await choose(user, /Employee/, 'Mona Khalil · EMP-0001');
    await choose(user, /Violation/, 'Late arrival without notice');
    expect(previewLine()).toBe('Working out the level…');
    await choose(user, /Employee/, 'Omar Fathy · EMP-0002');
    await waitFor(() => expect(previewLine()).toBe('Level 4 — Dismissal'));

    resolveFirst(ok(preview({ level: 2, action: 'WARNING' })));
    await new Promise((r) => setTimeout(r, 0));
    expect(previewLine()).toBe('Level 4 — Dismissal');
  });

  it('the violation picker lists groups in order and hides retired violations and groups', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: /Violation/ }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Late arrival without notice',
      'Using a phone in class',
    ]);
    expect(within(listbox).getByText('General table A')).toBeTruthy();
    expect(within(listbox).queryByText('Retired table')).toBeNull();
  });

  it('saves as pending once, even when pressed twice, then closes and refreshes', async () => {
    const user = userEvent.setup();
    apis.GET_PENALTY_PREVIEW.mockResolvedValue(ok(preview()));
    let resolve: (v: unknown) => void = () => undefined;
    apis.CREATE_PENALTY.mockReturnValue(new Promise((r) => (resolve = r)));
    const onOpenChange = renderDialog();

    await choose(user, /Employee/, 'Mona Khalil · EMP-0001');
    await choose(user, /Violation/, 'Late arrival without notice');
    await user.type(screen.getByRole('textbox', { name: /Note/ }), '  Came at 9:10  ');
    const save = screen.getByRole('button', { name: 'Save as pending' });
    await user.dblClick(save);
    await waitFor(() => expect(save).toHaveProperty('disabled', true));
    expect(apis.CREATE_PENALTY).toHaveBeenCalledTimes(1);
    expect(apis.CREATE_PENALTY).toHaveBeenCalledWith({
      employeeId: 'e-mona',
      violationId: 'v-late',
      date: todayIso(),
      note: 'Came at 9:10',
    });

    resolve(ok(record()));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('required fields block saving with translated messages (Arabic)', async () => {
    const user = userEvent.setup();
    renderDialog(vi.fn(), 'ar');
    await user.click(screen.getByRole('button', { name: 'حفظ قيد الانتظار' }));
    expect((await screen.findAllByText('هذا الحقل مطلوب.')).length).toBe(2);
    expect(apis.CREATE_PENALTY).not.toHaveBeenCalled();
  });

  it('PAYROLL_APPROVED error shown as a clear message', async () => {
    const user = userEvent.setup();
    apis.GET_PENALTY_PREVIEW.mockResolvedValue(ok(preview()));
    apis.CREATE_PENALTY.mockResolvedValue(failure(409, 'PAYROLL_APPROVED'));
    const onOpenChange = renderDialog();
    await choose(user, /Employee/, 'Mona Khalil · EMP-0001');
    await choose(user, /Violation/, 'Late arrival without notice');
    await user.click(screen.getByRole('button', { name: 'Save as pending' }));

    expect((await screen.findByRole('alert')).textContent).toBe("This month's payroll is approved and locked.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('EMPLOYEE_INACTIVE and VIOLATION_RETIRED land under their field', async () => {
    const user = userEvent.setup();
    apis.GET_PENALTY_PREVIEW.mockResolvedValue(failure(409, 'VIOLATION_RETIRED'));
    apis.CREATE_PENALTY.mockResolvedValueOnce(failure(409, 'EMPLOYEE_INACTIVE')).mockResolvedValueOnce(
      failure(409, 'VIOLATION_RETIRED'),
    );
    renderDialog();
    await choose(user, /Employee/, 'Mona Khalil · EMP-0001');
    await choose(user, /Violation/, 'Late arrival without notice');
    // The preview says why it can't be worked out.
    await waitFor(() => expect(previewLine()).toBe("This violation is retired and can't be used."));

    await user.click(screen.getByRole('button', { name: 'Save as pending' }));
    expect(await screen.findByText('This employee is inactive.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save as pending' }));
    await waitFor(() => expect(screen.getAllByText("This violation is retired and can't be used.").length).toBe(2));
  });
});

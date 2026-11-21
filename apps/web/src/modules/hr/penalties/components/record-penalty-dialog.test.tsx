// @vitest-environment jsdom
import '@/test/dom-polyfills';
import type { PenaltyPreview } from '@school-erp/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const apis = vi.hoisted(() => ({ GET_PENALTY_PREVIEW: vi.fn(), CREATE_PENALTY: vi.fn(), GET_PENALTY_GROUPS: vi.fn() }));
vi.mock('../apis', () => apis);
// The pickers' choices come from the API (searched there, never here).
const employeesApis = vi.hoisted(() => ({ GET_EMPLOYEES: vi.fn() }));
vi.mock('../../employees/apis', () => employeesApis);

import { todayIso } from '@/shared/lib/format';
import { matchesSearch } from '@school-erp/shared';
import { failure, groups, ok, record, renderPenalties } from '../test/fixtures';
import { RecordPenaltyDialog } from './record-penalty-dialog';

const PEOPLE = [
  { id: 'e-mona', code: 'EMP-0001', nameEn: 'Mona Khalil', nameAr: 'منى خليل', status: 'ACTIVE' },
  { id: 'e-omar', code: 'EMP-0002', nameEn: 'Omar Fathy', nameAr: 'عمر فتحي', status: 'ACTIVE' },
  { id: 'e-gone', code: 'EMP-0003', nameEn: 'Omar Gone', nameAr: 'عمر سابق', status: 'INACTIVE' },
];

/** The API's side: active employees for `status=ACTIVE`, searched by name or code. */
function serveEmployees() {
  employeesApis.GET_EMPLOYEES.mockImplementation((q: { status?: string; search?: string }) => {
    const found = PEOPLE.filter((p) => (!q.status || p.status === q.status) && matchesSearch(q.search ?? '', [p.nameEn, p.nameAr, p.code]));
    return ok(found);
  });
}

/**
 * The API's side of the catalogue for the record picker (its own tests are the API's): what can be
 * recorded now, in order; a search keeps a group by its name or its matching violations.
 */
function serveViolations() {
  apis.GET_PENALTY_GROUPS.mockImplementation((q: { search?: string } = {}) => {
    const usable = [...groups]
      .filter((g) => g.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({ ...g, violations: g.violations.filter((v) => v.isActive) }))
      .filter((g) => g.violations.length > 0);
    const text = q.search?.trim() ?? '';
    return ok(
      text
        ? usable
            .map((g) =>
              matchesSearch(text, [g.nameEn, g.nameAr]) ? g : { ...g, violations: g.violations.filter((v) => matchesSearch(text, [v.nameEn, v.nameAr])) },
            )
            .filter((g) => g.violations.length > 0)
        : usable,
    );
  });
}

const preview = (overrides: Partial<PenaltyPreview> = {}): PenaltyPreview => ({
  level: 1,
  action: 'NOTICE',
  days: null,
  priorCount: 0,
  recount: [],
  ...overrides,
});

/** §4 backdated: the owner's case — 19 Nov L1 and 20 Nov L2 approved, recording the 18th. */
const RECOUNT: PenaltyPreview['recount'] = [
  {
    id: 'p-19',
    date: '2026-11-19',
    before: { level: 1, action: 'DEDUCT_DAYS', days: 0.5 },
    after: { level: 2, action: 'DEDUCT_DAYS', days: 1 },
  },
  {
    id: 'p-20',
    date: '2026-11-20',
    before: { level: 2, action: 'DEDUCT_DAYS', days: 1 },
    after: { level: 3, action: 'DEDUCT_DAYS', days: 2 },
  },
];

function renderDialog(onOpenChange = vi.fn(), locale: 'en' | 'ar' = 'en') {
  renderPenalties(
    <RecordPenaltyDialog open onOpenChange={onOpenChange} />,
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
    serveEmployees();
    serveViolations();
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

  it('the employee picker asks the API for active employees by Arabic name or code and picks with the keyboard', async () => {
    const user = userEvent.setup();
    apis.GET_PENALTY_PREVIEW.mockResolvedValue(ok(preview()));
    renderPenalties(<RecordPenaltyDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: /Employee/ }));
    const search = screen.getByRole('searchbox', { name: /Type a name/ });
    await user.type(search, 'عمر');
    await waitFor(() => expect(employeesApis.GET_EMPLOYEES).toHaveBeenLastCalledWith({ status: 'ACTIVE', search: 'عمر', limit: 20 }));
    // The inactive one is never offered (the API asks for active ones only).
    await waitFor(() => expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Omar Fathy · EMP-0002']));
    await user.clear(search);
    await user.type(search, '0001');
    await waitFor(() => expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Mona Khalil · EMP-0001']));
    await user.keyboard('{Enter}');
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

  it('the violation picker shows the API\'s groups in order, what can be recorded now', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: /Violation/ }));
    const listbox = await screen.findByRole('listbox');
    expect(apis.GET_PENALTY_GROUPS).toHaveBeenCalledWith({ search: '' });
    await waitFor(() => expect(within(listbox).getAllByRole('option').length).toBe(2));
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
    // The refusal stands until the employee changes: Save waits.
    expect((screen.getByRole('button', { name: 'Save as pending' }) as HTMLButtonElement).disabled).toBe(true);
    await choose(user, /Employee/, 'Omar Fathy · EMP-0002');
    await waitFor(() => expect(screen.queryByText('This employee is inactive.')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Save as pending' }));
    // Under the violation now, and only there: the preview steps aside rather than repeat it.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Violation/ }).getAttribute('aria-invalid')).toBe('true'),
    );
    expect(screen.getAllByText("This violation is retired and can't be used.")).toHaveLength(1);
    expect(screen.queryByTestId('penalty-preview')).toBeNull();
  });

  it('the violation picker asks the API for what is typed (either language, group names too) and shows its answer', async () => {
    const user = userEvent.setup();
    renderDialog(vi.fn(), 'ar');
    await user.click(screen.getByRole('combobox', { name: /المخالفة/ }));
    const search = screen.getByRole('searchbox', { name: /اكتب اسم المخالفة/ });
    const shown = () => screen.queryAllByRole('option').map((o) => o.textContent);
    await user.type(search, 'الهاتف');
    await waitFor(() => expect(apis.GET_PENALTY_GROUPS).toHaveBeenLastCalledWith({ search: 'الهاتف' }));
    await waitFor(() => expect(shown()).toEqual(['استخدام الهاتف في الفصل']));
    await user.clear(search);
    await user.type(search, 'General');
    await waitFor(() => expect(shown()).toEqual(['التأخر دون إخطار']));
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(await screen.findByText('لا توجد مخالفة مستخدمة تطابق البحث.')).toBeTruthy();
  });

  it('once per day (§4): the preview says so before saving, and a refused save moves it under the date — shown once', async () => {
    const user = userEvent.setup();
    apis.GET_PENALTY_PREVIEW.mockResolvedValue(failure(409, 'VIOLATION_ONCE_PER_DAY'));
    apis.CREATE_PENALTY.mockResolvedValue(failure(409, 'VIOLATION_ONCE_PER_DAY'));
    const onOpenChange = renderDialog();
    await choose(user, /Employee/, 'Mona Khalil · EMP-0001');
    await choose(user, /Violation/, 'Late arrival without notice');
    const message = 'This violation counts once per day, and this employee already has one on this date.';
    await waitFor(() => expect(previewLine()).toBe(message));

    await user.click(screen.getByRole('button', { name: 'Save as pending' }));
    // Once, not in the preview and under the date both (dry run 2026-11-18).
    await waitFor(() => expect(screen.getByRole('button', { name: /Date of the violation/ }).getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(screen.queryByTestId('penalty-preview')).toBeNull();
    // Under the date field (its error is tied to the date's trigger), not the form-level alert.
    const date = screen.getByRole('button', { name: /Date of the violation/ });
    expect(date.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByRole('alert')?.textContent ?? '').not.toBe(message);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  describe('backdated penalty (§4, owner 2026-11-20)', () => {
    it.each([
      [
        'en',
        /Employee/,
        'Mona Khalil · EMP-0001',
        /Violation/,
        'Late arrival without notice',
        'Approving this will raise the level of 2 approved penalties:',
        ['19 Nov 2026: level 1 → 2, Deduct 0.5 day → Deduct 1 day', '20 Nov 2026: level 2 → 3, Deduct 1 day → Deduct 2 days'],
        'Recording changes nothing',
      ],
      [
        'ar',
        /الموظف/,
        // The picker names employees in the page's language.
        'منى خليل · EMP-0001',
        /المخالفة/,
        'التأخر دون إخطار',
        'اعتماد هذا الجزاء سيرفع مرة جزاءين معتمدين:',
        ['19 نوفمبر 2026: المرة 1 ← 2، خصم 0.5 يوم ← خصم يوم واحد', '20 نوفمبر 2026: المرة 2 ← 3، خصم يوم واحد ← خصم يومين'],
        'التسجيل وحده لا يغيّر شيئًا',
      ],
    ] as const)(
      '(%s) the heads-up lists the approved penalties approving it would raise, before saving; saving still works',
      async (locale, employeeField, employee, violationField, violation, heading, items, note) => {
        const user = userEvent.setup();
        apis.GET_PENALTY_PREVIEW.mockResolvedValue(ok(preview({ recount: RECOUNT })));
        apis.CREATE_PENALTY.mockResolvedValue(ok(record({ recount: RECOUNT })));
        const onOpenChange = renderDialog(vi.fn(), locale);
        await choose(user, employeeField, employee);
        await choose(user, violationField, violation);
        const heads = await screen.findByTestId('penalty-recount');
        expect(heads.textContent).toContain(heading);
        expect(within(heads).getAllByRole('listitem').map((li) => li.textContent?.replace('•', '').trim())).toEqual(items);
        expect(heads.textContent).toContain(note);
        await user.click(screen.getByRole('button', { name: locale === 'en' ? 'Save as pending' : /حفظ/ }));
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      },
    );

    it('no heads-up when nothing would change', async () => {
      const user = userEvent.setup();
      apis.GET_PENALTY_PREVIEW.mockResolvedValue(ok(preview()));
      renderDialog();
      await choose(user, /Employee/, 'Mona Khalil · EMP-0001');
      await choose(user, /Violation/, 'Late arrival without notice');
      await waitFor(() => expect(previewLine()).toBe('Level 1 — Notice'));
      expect(screen.queryByTestId('penalty-recount')).toBeNull();
    });

    it('one of them in an approved payroll month: the preview says so as an error naming the month; a refused save lands under the date', async () => {
      const user = userEvent.setup();
      const locked = {
        success: false,
        status: 409,
        error: 'PENALTY_RECOUNT_MONTH_LOCKED',
        message: 'Server message',
        params: { month: '2026-10' },
      } as never;
      apis.GET_PENALTY_PREVIEW.mockResolvedValue(locked);
      apis.CREATE_PENALTY.mockResolvedValue(locked);
      const onOpenChange = renderDialog();
      await choose(user, /Employee/, 'Mona Khalil · EMP-0001');
      await choose(user, /Violation/, 'Late arrival without notice');
      const message =
        'This would raise the level of an approved penalty in October 2026, whose payroll is approved. Corrections for an approved month go into the next month as adjustments.';
      await waitFor(() => expect(previewLine()).toBe(message));
      await user.click(screen.getByRole('button', { name: 'Save as pending' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Date of the violation/ }).getAttribute('aria-invalid')).toBe('true'),
      );
      expect(screen.getAllByText(message)).toHaveLength(1);
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      // Only the refusal under the date — not the "Can't be in the future" hint, which read as the
      // cause — and Save waits while it stands (dry run 2026-11-20 b).
      expect(screen.queryByText("Can't be in the future.")).toBeNull();
      const save = screen.getByRole('button', { name: 'Save as pending' }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      await user.click(save);
      expect(apis.CREATE_PENALTY).toHaveBeenCalledTimes(1);
      // Another violation: the refusal no longer stands, the hint is back and Save works again.
      apis.GET_PENALTY_PREVIEW.mockResolvedValue(ok(preview()));
      await choose(user, /Violation/, 'Using a phone in class');
      await waitFor(() => expect(save.disabled).toBe(false));
      expect(screen.getByText("Can't be in the future.")).toBeTruthy();
      expect(screen.queryByText(message)).toBeNull();
    });
  });
});

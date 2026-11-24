// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), prefetch: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../apis', () => ({
  CREATE_EMPLOYEE: vi.fn(),
  UPDATE_EMPLOYEE: vi.fn(),
  // The pickers' choices come from the API (searched there, never here).
  GET_DEPARTMENTS: vi.fn(),
  GET_STAGES: vi.fn(),
  GET_JOB_TITLES: vi.fn(),
  GET_EMPLOYEE_GRADES: vi.fn(),
  GET_MANAGER_OPTIONS: vi.fn(),
}));

import type { Employee, EmployeeSummary } from '@school-erp/shared';
import { CREATE_EMPLOYEE, GET_DEPARTMENTS, GET_EMPLOYEE_GRADES, GET_JOB_TITLES, GET_MANAGER_OPTIONS, GET_STAGES, UPDATE_EMPLOYEE } from '../apis';
import { departments, employee, grades, jobTitles, renderEmployees, stages, summary } from '../test/fixtures';

const page = <T,>(data: T[]) => ({ success: true as const, status: 200, data, meta: { total: data.length, page: 1, limit: 20 } });
const managerOptions = vi.mocked(GET_MANAGER_OPTIONS);
import { EmployeeForm } from './employee-form';

const update = vi.mocked(UPDATE_EMPLOYEE);
const create = vi.mocked(CREATE_EMPLOYEE);

function renderForm({
  editing,
  candidates = [],
  locale = 'en',
  hidden,
}: {
  editing?: Employee;
  /** What the API answers for the manager picker (it filters out the employee and the inactive). */
  candidates?: EmployeeSummary[];
  locale?: 'en' | 'ar';
  hidden?: { department?: boolean; employeeGrade?: boolean };
} = {}) {
  vi.mocked(GET_DEPARTMENTS).mockResolvedValue(page(departments) as never);
  vi.mocked(GET_STAGES).mockResolvedValue(page(stages) as never);
  vi.mocked(GET_JOB_TITLES).mockResolvedValue(page(jobTitles) as never);
  vi.mocked(GET_EMPLOYEE_GRADES).mockResolvedValue(page(grades) as never);
  managerOptions.mockResolvedValue(page(candidates) as never);
  return renderEmployees(
    <EmployeeForm
      basePath={`/${locale}/employees`}
      employee={editing}
      currentHidden={hidden}
      hasManagerCandidates={candidates.length > 0}
    />,
    locale,
  );
}

const conflict = (error: string, message: string) =>
  ({ success: false, status: 409, error, message }) as Awaited<ReturnType<typeof UPDATE_EMPLOYEE>>;
const ok = (data: Employee) => ({ success: true, status: 200, data }) as Awaited<ReturnType<typeof UPDATE_EMPLOYEE>>;

describe('EmployeeForm', () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    update.mockReset();
    create.mockReset();
  });
  afterEach(cleanup);

  it('Server validation errors (duplicate national ID) map onto the field', async () => {
    const user = userEvent.setup();
    update.mockResolvedValue(conflict('DUPLICATE_NATIONAL_ID', 'Another employee already has this national ID.'));
    renderForm({ editing: employee });

    const nationalId = screen.getByRole('textbox', { name: /National ID/ });
    await user.clear(nationalId);
    await user.type(nationalId, '29001011234568');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // Only the changed field is sent.
    await waitFor(() => expect(update).toHaveBeenCalledWith('e-mona', { nationalId: '29001011234568' }));
    expect(await screen.findByText('Another employee already has this national ID.')).toBeTruthy();
    expect(nationalId.getAttribute('aria-invalid')).toBe('true');
    expect(push).not.toHaveBeenCalled();
  });

  it('maps a duplicate fingerprint ID onto its field, and an unmapped error to the form', async () => {
    const user = userEvent.setup();
    update.mockResolvedValueOnce(conflict('DUPLICATE_FINGERPRINT_ID', 'dup'));
    renderForm({ editing: employee });
    const fingerprint = screen.getByRole('textbox', { name: /Fingerprint ID/ });
    await user.clear(fingerprint);
    await user.type(fingerprint, 'FP-9999');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fingerprint.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('Another employee already has this fingerprint ID.')).toBeTruthy();

    update.mockResolvedValueOnce({ success: false, status: 400, error: 'LIST_ITEM_HIDDEN', message: 'This item is hidden.' } as never);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findByRole('alert')).textContent).toContain('This item is hidden.');
  });

  it('Manager picker asks the API for active managers other than the employee, and lists its answer', async () => {
    const user = userEvent.setup();
    const candidates = [summary({ id: 'e-omar', code: 'EMP-0002', nameEn: 'Omar Fathy', nameAr: 'عمر فتحي' })];
    renderForm({ editing: employee, candidates });

    await user.click(screen.getByRole('combobox', { name: /Direct manager/ }));
    const listbox = await screen.findByRole('listbox');
    await waitFor(() =>
      expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual(['No direct manager', 'Omar Fathy · EMP-0002']),
    );
    // The employee is left out by the API (`excludeId`), one page for the typed text.
    expect(managerOptions).toHaveBeenCalledWith('e-mona', { search: '', limit: 20 });
  });

  it('Manager picker: a kept manager who no longer manages people is listed and flagged; search finds by code', async () => {
    const user = userEvent.setup();
    const candidates = [summary({ id: 'e-omar', code: 'EMP-0002', nameEn: 'Omar Fathy', nameAr: 'عمر فتحي' })];
    const kept = { id: 'e-hany', code: 'EMP-0007', nameEn: 'Hany Said', nameAr: 'هاني سعيد', managesPeople: false, photoUrl: null, gender: 'MALE' as const };
    renderForm({ editing: { ...employee, manager: kept }, candidates });

    const trigger = screen.getByRole('combobox', { name: /Direct manager/ });
    expect(trigger.textContent).toContain('Hany Said · EMP-0007');
    expect(screen.getByText('No longer in a managing role; kept for this employee.')).toBeTruthy();

    await user.click(trigger);
    const listbox = await screen.findByRole('listbox');
    await waitFor(() =>
      expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual(['No direct manager', 'Omar Fathy · EMP-0002']),
    );
    await user.keyboard('EMP-0002');
    await waitFor(() => expect(managerOptions).toHaveBeenLastCalledWith('e-mona', { search: 'EMP-0002', limit: 20 }));
    await waitFor(() =>
      expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Omar Fathy · EMP-0002']),
    );
    await user.keyboard('{Enter}');
    // Another manager chosen: the note goes away.
    await waitFor(() => expect(screen.queryByText('No longer in a managing role; kept for this employee.')).toBeNull());
  });

  it('Manager picker in Arabic: the kept-manager note and the no-managers hint are translated', () => {
    const kept = { id: 'e-hany', code: 'EMP-0007', nameEn: 'Hany Said', nameAr: 'هاني سعيد', managesPeople: false, photoUrl: null, gender: 'MALE' as const };
    renderForm({ editing: { ...employee, manager: kept }, locale: 'ar' });
    expect(screen.getByText('لم يعد في منصب إداري؛ يبقى مديرًا لهذا الموظف.')).toBeTruthy();
    cleanup();
    renderForm({ locale: 'ar' });
    expect(screen.getByText(/فعّل «يدير موظفين»/)).toBeTruthy();
  });

  it('a refused non-manager (MANAGER_NOT_MANAGING) lands on the Direct manager field', async () => {
    const user = userEvent.setup();
    update.mockResolvedValue({
      success: false,
      status: 400,
      error: 'MANAGER_NOT_MANAGING',
      message: 'The direct manager must hold a job title that manages people.',
    } as never);
    const candidates = [summary({ id: 'e-omar', code: 'EMP-0002', nameEn: 'Omar Fathy', nameAr: 'عمر فتحي' })];
    renderForm({ editing: employee, candidates });
    await user.click(screen.getByRole('combobox', { name: /Direct manager/ }));
    await user.click(await screen.findByRole('option', { name: 'Omar Fathy · EMP-0002' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('e-mona', { managerId: 'e-omar' }));
    expect(await screen.findByText('The direct manager must hold a job title that manages people.')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Direct manager/ }).getAttribute('aria-invalid')).toBe('true');
  });

  it('the contract dates are on the create form only: an edit changes them through Contracts', () => {
    const { unmount } = renderForm();
    expect(screen.getByRole('button', { name: /Contract start/ })).toBeTruthy();
    unmount();
    renderForm({ editing: employee });
    expect(screen.queryByRole('button', { name: /Contract start/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Contract end/ })).toBeNull();
  });

  describe('probation end (§3, N0)', () => {
    const probationField = () => screen.getByRole('button', { name: /Probation ends/ });

    it('sits with the job fields, with the hint; editing shows the saved date', () => {
      renderForm({ editing: employee });
      expect(probationField().textContent).toContain('30 Nov 2020');
      expect(screen.getByText('Filled from the hire date; change it if this employee’s probation differs.')).toBeTruthy();
    });

    it('a new employee starts with it empty: left so, the request leaves it to the API (filled from the hire date)', () => {
      renderForm();
      expect(probationField().textContent).toContain('Pick a day');
    });

    it('edge 5 — clearing it on an edit sends probationEnd: null only', async () => {
      const user = userEvent.setup();
      update.mockResolvedValue(ok({ ...employee, probationEnd: null }));
      renderForm({ editing: employee });
      await user.click(probationField());
      await user.click(await screen.findByRole('button', { name: 'Clear the date' }));
      expect(probationField().textContent).toContain('Pick a day');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(update).toHaveBeenCalledWith('e-mona', { probationEnd: null }));
    });

    it('an empty field has nothing to clear', async () => {
      const user = userEvent.setup();
      renderForm({ editing: { ...employee, probationEnd: null } });
      await user.click(probationField());
      await screen.findByRole('grid');
      expect(screen.queryByRole('button', { name: 'Clear the date' })).toBeNull();
    });

    it('edge 4 — a refused date (PROBATION_BEFORE_HIRE) lands on the field', async () => {
      const user = userEvent.setup();
      update.mockResolvedValue({
        success: false,
        status: 400,
        error: 'PROBATION_BEFORE_HIRE',
        message: 'The probation end can’t be before the hire date.',
      } as never);
      renderForm({ editing: employee });
      await user.click(probationField());
      await user.click(await screen.findByRole('button', { name: 'Clear the date' }));
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText('The probation end can’t be before the hire date.')).toBeTruthy();
      expect(probationField().getAttribute('aria-invalid')).toBe('true');
    });

    it('Arabic: the label and hint are translated', () => {
      renderForm({ editing: employee, locale: 'ar' });
      expect(screen.getByRole('button', { name: /نهاية فترة الاختبار/ })).toBeTruthy();
      expect(screen.getByText('تُملأ من تاريخ التعيين؛ غيّرها إن كانت فترة اختبار هذا الموظف مختلفة.')).toBeTruthy();
    });
  });

  it('edit: Save stays disabled until something changes, and again once it is changed back', async () => {
    const user = userEvent.setup();
    renderForm({ editing: employee });
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toHaveProperty('disabled', true);
    expect(screen.getByText('No changes yet.')).toBeTruthy();

    const phone = screen.getByRole('textbox', { name: /Phone/ }) as HTMLInputElement;
    const original = phone.value;
    await user.clear(phone);
    await user.type(phone, '01011112222');
    await waitFor(() => expect(save).toHaveProperty('disabled', false));
    expect(screen.getByText('You have unsaved changes.')).toBeTruthy();

    await user.clear(phone);
    if (original) await user.type(phone, original);
    await waitFor(() => expect(save).toHaveProperty('disabled', true));
    await user.click(save);
    expect(update).not.toHaveBeenCalled();
  });

  it('Double submit prevented', async () => {
    const user = userEvent.setup();
    let resolve: (v: Awaited<ReturnType<typeof UPDATE_EMPLOYEE>>) => void = () => undefined;
    update.mockReturnValue(new Promise((r) => (resolve = r)));
    renderForm({ editing: employee });
    const phone = screen.getByRole('textbox', { name: /Phone/ });
    await user.clear(phone);
    await user.type(phone, '01011112222');

    const save = screen.getByRole('button', { name: 'Save changes' });
    await user.dblClick(save);
    await user.click(save);
    await waitFor(() => expect(save).toHaveProperty('disabled', true));
    expect(update).toHaveBeenCalledTimes(1);

    resolve(ok(employee));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/employees/e-mona'));
    // Still busy while the profile loads, so it can't be sent again.
    expect(save).toHaveProperty('disabled', true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('keeps a department that was hidden after the employee got it, and says so', () => {
    renderForm({
      editing: { ...employee, department: { id: 'd-old', nameEn: 'Old Department', nameAr: 'قسم قديم' } },
      hidden: { department: true },
    });
    const trigger = screen.getByRole('combobox', { name: /Department/ });
    expect(trigger.textContent).toContain('Old Department');
    expect(screen.getByText('Hidden from new choices; kept for this employee.')).toBeTruthy();
  });

  describe('grade (§3, owner 2026-11-24: picked from the Grades list)', () => {
    const gradeField = () => screen.getByRole('combobox', { name: /^Grade/ });

    it('the API lists the grades, after "No grade"; a new employee starts with none', async () => {
      const user = userEvent.setup();
      renderForm();
      expect(gradeField().textContent).toContain('No grade');
      await user.click(gradeField());
      const listbox = await screen.findByRole('listbox');
      await waitFor(() =>
        expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual(['No grade', 'Grade 1', 'Grade 2']),
      );
      // One page of the typed text, asked of the API (never filtered here).
      expect(vi.mocked(GET_EMPLOYEE_GRADES)).toHaveBeenCalledWith({ includeHidden: false, search: '', limit: 20 });
    });

    it('choosing a grade on an edit sends its id only; "No grade" clears it', async () => {
      const user = userEvent.setup();
      update.mockResolvedValue(ok(employee));
      renderForm({ editing: employee });
      await user.click(gradeField());
      await user.click(await screen.findByRole('option', { name: 'Grade 2' }));
      expect(gradeField().textContent).toContain('Grade 2');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(update).toHaveBeenCalledWith('e-mona', { employeeGradeId: 'g-2' }));

      cleanup();
      update.mockReset();
      update.mockResolvedValue(ok(employee));
      renderForm({ editing: { ...employee, employeeGrade: { id: 'g-1', nameEn: 'Grade 1', nameAr: 'الدرجة الأولى' } } });
      await user.click(gradeField());
      await user.click(await screen.findByRole('option', { name: 'No grade' }));
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(update).toHaveBeenCalledWith('e-mona', { employeeGradeId: null }));
    });

    it('keeps a grade hidden after the employee got it, in the page language, and says so', () => {
      renderForm({
        editing: { ...employee, employeeGrade: { id: 'g-old', nameEn: 'Old grade', nameAr: 'درجة قديمة' } },
        hidden: { employeeGrade: true },
        locale: 'ar',
      });
      expect(screen.getByRole('combobox', { name: /^الدرجة/ }).textContent).toContain('درجة قديمة');
      expect(screen.getByText('مخفي من الاختيارات الجديدة؛ يبقى لهذا الموظف.')).toBeTruthy();
    });
  });

  it('new employee: required fields block submit with translated messages; contract is prefilled', async () => {
    const user = userEvent.setup();
    renderForm({ locale: 'ar' });
    // Contract dates default to the current contract year (1 June – 31 May).
    expect(screen.getByRole('button', { name: /بداية العقد/ }).textContent).toMatch(/يونيو/);
    expect(screen.getByRole('button', { name: /نهاية العقد/ }).textContent).toMatch(/مايو/);

    await user.click(screen.getByRole('button', { name: 'حفظ الموظف' }));
    expect((await screen.findAllByText('اكتب الاسم الكامل.')).length).toBe(2);
    expect(screen.getAllByText('هذا الحقل مطلوب.').length).toBeGreaterThan(3);
    expect(create).not.toHaveBeenCalled();
  });

  describe('"Also teaches in" (§3)', () => {
    // The API leaves out what it is asked to exclude (`excludeIds`); the browser never filters.
    function stagesApi() {
      vi.mocked(GET_STAGES).mockImplementation((async (query: { excludeIds?: string[] } = {}) =>
        page(stages.filter((s) => !query.excludeIds?.includes(s.id)))) as never);
    }
    const otherPicker = () => screen.getByRole('combobox', { name: /Also teaches in/ });
    async function optionsOf(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) {
      await user.click(trigger);
      const listbox = await screen.findByRole('listbox');
      await waitFor(() => expect(within(listbox).queryAllByRole('option').length).toBeGreaterThan(0));
      return within(listbox).getAllByRole('option').map((o) => o.textContent);
    }

    it('the picker asks the API to leave out the main stage, and does not offer it', async () => {
      const user = userEvent.setup();
      renderForm({ editing: employee });
      stagesApi();
      expect(await optionsOf(user, otherPicker())).toEqual(['Kindergarten']);
      expect(GET_STAGES).toHaveBeenLastCalledWith({ includeHidden: false, search: '', limit: 20, excludeIds: ['s-pri'] });
    });

    it('a stage already added is left out too', async () => {
      const user = userEvent.setup();
      renderForm({ editing: { ...employee, stage: stages[0] } });
      stagesApi();
      await optionsOf(user, otherPicker());
      await user.click(screen.getByRole('option', { name: 'Primary' }));
      expect(within(screen.getByTestId('other-stages')).getByText('Primary')).toBeTruthy();
      await user.click(otherPicker());
      await waitFor(() =>
        expect(GET_STAGES).toHaveBeenLastCalledWith(expect.objectContaining({ excludeIds: ['s-kg', 's-pri'] })),
      );
    });

    it('choosing as main stage one already listed drops it from the list, with no error to clear', async () => {
      const user = userEvent.setup();
      update.mockResolvedValue(ok(employee));
      renderForm({ editing: employee });
      stagesApi();
      await optionsOf(user, otherPicker());
      await user.click(screen.getByRole('option', { name: 'Kindergarten' }));
      expect(within(screen.getByTestId('other-stages')).getByText('Kindergarten')).toBeTruthy();

      // Main stage → Kindergarten (the main picker isn't excluded from anything).
      vi.mocked(GET_STAGES).mockResolvedValue(page(stages) as never);
      await user.click(screen.getByRole('combobox', { name: /Main stage/ }));
      await user.click(await screen.findByRole('option', { name: 'Kindergarten' }));
      await waitFor(() => expect(screen.queryByTestId('other-stages')).toBeNull());
      expect(screen.queryByText("The main stage is already this person's stage. Pick other stages here.")).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(update).toHaveBeenCalledWith('e-mona', expect.objectContaining({ stageId: 's-kg' })));
      expect(update.mock.calls[0][1]).not.toHaveProperty('otherStageIds');
    });
  });

  it('phone takes a landline or international number as typed, and rejects letters', async () => {
    const user = userEvent.setup();
    update.mockResolvedValue(ok(employee));
    renderForm({ editing: employee });
    const phone = screen.getByRole('textbox', { name: /^Phone/ }) as HTMLInputElement;
    await user.clear(phone);
    await user.paste('+20 (2) 2345-6789');
    await user.type(phone, 'x');
    expect(phone.value).toBe('+20 (2) 2345-6789');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('e-mona', { phone: '+20 (2) 2345-6789' }));
  });

  it('phone shorter than 7 characters blocks submit', async () => {
    const user = userEvent.setup();
    renderForm({ editing: employee });
    const phone = screen.getByRole('textbox', { name: /^Phone/ });
    await user.clear(phone);
    await user.type(phone, '12345');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Enter a phone number of 7 to 20 characters/)).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });
});

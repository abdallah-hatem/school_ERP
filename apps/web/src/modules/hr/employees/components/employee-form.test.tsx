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
vi.mock('../apis', () => ({ CREATE_EMPLOYEE: vi.fn(), UPDATE_EMPLOYEE: vi.fn() }));

import type { Employee, EmployeeSummary } from '@school-erp/shared';
import { CREATE_EMPLOYEE, UPDATE_EMPLOYEE } from '../apis';
import { departments, employee, item, jobTitles, renderEmployees, stages, summary } from '../test/fixtures';
import { EmployeeForm } from './employee-form';

const update = vi.mocked(UPDATE_EMPLOYEE);
const create = vi.mocked(CREATE_EMPLOYEE);

function renderForm({
  editing,
  candidates = [],
  locale = 'en',
  deptList = departments,
}: {
  editing?: Employee;
  candidates?: EmployeeSummary[];
  locale?: 'en' | 'ar';
  deptList?: typeof departments;
} = {}) {
  return renderEmployees(
    <EmployeeForm
      basePath={`/${locale}/employees`}
      employee={editing}
      departments={deptList}
      stages={stages}
      jobTitles={jobTitles}
      managerCandidates={candidates}
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

  it('Manager picker excludes the employee and inactive employees', async () => {
    const user = userEvent.setup();
    const candidates = [
      summary({ id: 'e-mona', code: 'EMP-0001', nameEn: 'Mona Khalil', nameAr: 'منى خليل' }),
      summary({ id: 'e-omar', code: 'EMP-0002', nameEn: 'Omar Fathy', nameAr: 'عمر فتحي' }),
      summary({ id: 'e-sara', code: 'EMP-0003', nameEn: 'Sara Adel', nameAr: 'سارة عادل', status: 'INACTIVE' }),
    ];
    renderForm({ editing: employee, candidates });

    await user.click(screen.getByRole('combobox', { name: /Direct manager/ }));
    const listbox = await screen.findByRole('listbox');
    const names = within(listbox)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(names).toEqual(['No direct manager', 'Omar Fathy · EMP-0002']);
  });

  it('Manager picker: a kept manager who no longer manages people is listed and flagged; search finds by code', async () => {
    const user = userEvent.setup();
    const candidates = [summary({ id: 'e-omar', code: 'EMP-0002', nameEn: 'Omar Fathy', nameAr: 'عمر فتحي' })];
    const kept = { id: 'e-hany', code: 'EMP-0007', nameEn: 'Hany Said', nameAr: 'هاني سعيد', managesPeople: false, photoUrl: null };
    renderForm({ editing: { ...employee, manager: kept }, candidates });

    const trigger = screen.getByRole('combobox', { name: /Direct manager/ });
    expect(trigger.textContent).toContain('Hany Said · EMP-0007');
    expect(screen.getByText('No longer in a managing role; kept for this employee.')).toBeTruthy();

    await user.click(trigger);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'No direct manager',
      'Omar Fathy · EMP-0002',
      'Hany Said · EMP-0007',
    ]);
    await user.keyboard('EMP-0002');
    await waitFor(() =>
      expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Omar Fathy · EMP-0002']),
    );
    await user.keyboard('{Enter}');
    // Another manager chosen: the note goes away.
    await waitFor(() => expect(screen.queryByText('No longer in a managing role; kept for this employee.')).toBeNull());
  });

  it('Manager picker in Arabic: the kept-manager note and the no-managers hint are translated', () => {
    const kept = { id: 'e-hany', code: 'EMP-0007', nameEn: 'Hany Said', nameAr: 'هاني سعيد', managesPeople: false, photoUrl: null };
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
      deptList: [...departments, item('d-old', 'Old Department', 'قسم قديم', false)],
    });
    const trigger = screen.getByRole('combobox', { name: /Department/ });
    expect(trigger.textContent).toContain('Old Department');
    expect(screen.getByText('Hidden from new choices; kept for this employee.')).toBeTruthy();
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

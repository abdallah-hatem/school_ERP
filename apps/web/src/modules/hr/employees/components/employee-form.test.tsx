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

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const fingerprint = screen.getByRole('textbox', { name: /Fingerprint ID/ });
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

  it('Double submit prevented', async () => {
    const user = userEvent.setup();
    let resolve: (v: Awaited<ReturnType<typeof UPDATE_EMPLOYEE>>) => void = () => undefined;
    update.mockReturnValue(new Promise((r) => (resolve = r)));
    renderForm({ editing: employee });

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

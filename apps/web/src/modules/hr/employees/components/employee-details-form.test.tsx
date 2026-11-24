// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor } from '@testing-library/react';
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
  GET_DEPARTMENTS: vi.fn(),
  GET_STAGES: vi.fn(),
  GET_JOB_TITLES: vi.fn(),
  GET_EMPLOYEE_GRADES: vi.fn(),
  GET_MANAGER_OPTIONS: vi.fn(),
  UPDATE_EMPLOYEE: vi.fn(),
  UPLOAD_EMPLOYEE_PHOTO: vi.fn(),
  REMOVE_EMPLOYEE_PHOTO: vi.fn(),
}));

import type { Employee } from '@school-erp/shared';
import { CREATE_EMPLOYEE, REMOVE_EMPLOYEE_PHOTO, UPDATE_EMPLOYEE, UPLOAD_EMPLOYEE_PHOTO } from '../apis';
import { employee, renderEmployees } from '../test/fixtures';
import { EmployeeForm } from './employee-form';
import { photoFileProblem } from './employee-photo-field';

const update = vi.mocked(UPDATE_EMPLOYEE);
const create = vi.mocked(CREATE_EMPLOYEE);
const upload = vi.mocked(UPLOAD_EMPLOYEE_PHOTO);
const remove = vi.mocked(REMOVE_EMPLOYEE_PHOTO);

const insured: Employee = {
  ...employee,
  insuranceStatus: 'INSURED',
  insuranceNumber: '123456789',
  insuranceRegistrationDate: '2021-09-01',
  insuredSalary: 900_000,
};

const ok = (data: Employee) => ({ success: true, status: 200, data }) as Awaited<ReturnType<typeof UPDATE_EMPLOYEE>>;

function renderForm(editing?: Employee, locale: 'en' | 'ar' = 'en') {
  return renderEmployees(
    <EmployeeForm
      basePath={`/${locale}/employees`}
      employee={editing}
    />,
    locale,
  );
}

async function chooseOption(user: ReturnType<typeof userEvent.setup>, field: RegExp, option: string) {
  await user.click(screen.getByRole('combobox', { name: field }));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('EmployeeForm — insurance, bank, emergency contact, qualification (§3)', () => {
  beforeEach(() => {
    for (const m of [push, refresh, update, create, upload, remove]) m.mockReset();
  });
  afterEach(cleanup);

  it('the three insurance details appear only while insured, and are required then', async () => {
    const user = userEvent.setup();
    renderForm(employee);
    expect(screen.queryByRole('textbox', { name: /Insurance number/ })).toBeNull();

    await chooseOption(user, /Insurance status/, 'Insured');
    expect(screen.getByRole('textbox', { name: /Insurance number/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Registration date/ })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Insured salary/ })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findAllByText('This field is required.')).length).toBe(3);
    expect(update).not.toHaveBeenCalled();
  });

  it('Arabic: the same rule with Arabic messages; a non-digit insurance number is refused', async () => {
    const user = userEvent.setup();
    renderForm({ ...insured, insuranceNumber: null, insuredSalary: null }, 'ar');
    await user.type(screen.getByRole('textbox', { name: /الرقم التأميني/ }), '12-34');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await screen.findByText('الرقم التأميني يجب أن يكون أرقامًا فقط (حتى 20 رقمًا).')).toBeTruthy();
    expect(screen.getByText('هذا الحقل مطلوب.')).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it('choosing "Not insured" hides and clears the details; saving sends them cleared', async () => {
    const user = userEvent.setup();
    update.mockResolvedValue(ok(employee));
    renderForm(insured);
    expect((screen.getByRole('textbox', { name: /Insurance number/ }) as HTMLInputElement).value).toBe('123456789');

    await chooseOption(user, /Insurance status/, 'Not insured');
    expect(screen.queryByRole('textbox', { name: /Insurance number/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('e-mona', {
        insuranceStatus: 'NOT_INSURED',
        insuranceNumber: null,
        insuranceRegistrationDate: null,
        insuredSalary: null,
      }),
    );

    // Insured again: the details come back empty, not with the old values.
    cleanup();
    renderForm(insured);
    await chooseOption(user, /Insurance status/, 'Not insured');
    await chooseOption(user, /Insurance status/, 'Insured');
    expect((screen.getByRole('textbox', { name: /Insurance number/ }) as HTMLInputElement).value).toBe('');
  });

  it('maps a duplicate insurance number onto its field (EN and AR)', async () => {
    const user = userEvent.setup();
    update.mockResolvedValue({ success: false, status: 409, error: 'DUPLICATE_INSURANCE_NUMBER', message: 'dup' } as never);
    renderForm(insured);
    const number = screen.getByRole('textbox', { name: /Insurance number/ });
    await user.clear(number);
    await user.type(number, '987654321');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(number.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('Another employee already has this insurance number.')).toBeTruthy();

    cleanup();
    renderForm(insured, 'ar');
    const ar = screen.getByRole('textbox', { name: /الرقم التأميني/ });
    await user.clear(ar);
    await user.type(ar, '987654321');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await screen.findByText('رقم التأمين مسجل لموظف آخر.')).toBeTruthy();
  });

  it('IBAN: a wrong one is refused in both languages; a spaced lower-case one is sent normalised', async () => {
    const user = userEvent.setup();
    update.mockResolvedValue(ok(employee));
    renderForm(employee);
    const iban = screen.getByRole('textbox', { name: /IBAN/ });
    await user.type(iban, 'EG12');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter an Egyptian IBAN: EG followed by 27 digits.')).toBeTruthy();
    expect(update).not.toHaveBeenCalled();

    await user.clear(iban);
    await user.type(iban, 'eg38 0019 0005 0000 0000 2631 8000 2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('e-mona', { iban: 'EG380019000500000000263180002' }));

    cleanup();
    renderForm(employee, 'ar');
    await user.type(screen.getByRole('textbox', { name: /الآيبان/ }), 'EG12');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await screen.findByText('اكتب رقم آيبان مصريًا: EG ثم 27 رقمًا.')).toBeTruthy();
  });

  it('emergency phone follows the employee phone rules; degree and graduation year come from lists', async () => {
    const user = userEvent.setup();
    update.mockResolvedValue(ok(employee));
    renderForm(employee);
    const phone = screen.getByRole('textbox', { name: /Contact phone/ });
    await user.type(phone, '123');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Enter a phone number of 7 to 20 characters/)).toBeTruthy();

    await user.clear(phone);
    await user.type(phone, '01112345678');
    await chooseOption(user, /Highest degree/, "Master's degree");
    await user.click(screen.getByRole('combobox', { name: /Graduation year/ }));
    const thisYear = String(new Date().getFullYear());
    expect(await screen.findByRole('option', { name: thisYear })).toBeTruthy();
    expect(screen.queryByRole('option', { name: String(Number(thisYear) + 1) })).toBeNull();
    await user.click(screen.getByRole('option', { name: thisYear }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('e-mona', {
        emergencyContactPhone: '01112345678',
        highestDegree: 'MASTER',
        graduationYear: Number(thisYear),
      }),
    );
  });
});

describe('EmployeeForm — photo (§3)', () => {
  beforeEach(() => {
    for (const m of [push, refresh, update, create, upload, remove]) m.mockReset();
    // jsdom has no object URLs; the preview only needs a string.
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(cleanup);

  const png = (size = 1000) => new File([new Uint8Array(size)], 'me.png', { type: 'image/png' });

  it('photoFileProblem: PNG, JPG and WebP up to 2 MB', () => {
    expect(photoFileProblem({ type: 'image/png', size: 10 })).toBeNull();
    expect(photoFileProblem({ type: 'image/jpeg', size: 10 })).toBeNull();
    expect(photoFileProblem({ type: 'image/webp', size: 2 * 1024 * 1024 })).toBeNull();
    expect(photoFileProblem({ type: 'image/svg+xml', size: 10 })).toBe('type');
    expect(photoFileProblem({ type: 'image/gif', size: 10 })).toBe('type');
    expect(photoFileProblem({ type: 'image/png', size: 2 * 1024 * 1024 + 1 })).toBe('size');
  });

  it('a wrong file shows the translated problem and is never sent (EN, AR)', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderForm(employee);
    await user.upload(screen.getByLabelText('Choose a photo'), new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(screen.getByRole('alert').textContent).toBe('Only PNG, JPG or WebP files can be used.');
    await user.upload(screen.getByLabelText('Choose a photo'), png(3 * 1024 * 1024));
    expect(screen.getByRole('alert').textContent).toBe('The file must be 2 MB or smaller.');
    expect(screen.queryByRole('button', { name: 'Upload photo' })).toBeNull();

    cleanup();
    renderForm(employee, 'ar');
    await user.upload(screen.getByLabelText('اختر صورة'), new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(screen.getByRole('alert').textContent).toBe('يمكن استخدام ملفات PNG أو JPG أو WebP فقط.');
    expect(upload).not.toHaveBeenCalled();
  });

  it('editing: Upload sends the photo once and keeps Save untouched; Remove clears it', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(ok({ ...employee, photoUrl: '/files/employee-photos/e-mona-1.png' }));
    remove.mockResolvedValue(ok(employee));
    renderForm(employee);
    await user.upload(screen.getByLabelText('Choose a photo'), png());
    await user.click(screen.getByRole('button', { name: 'Upload photo' }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0]![0]).toBe('e-mona');
    expect(await screen.findByText('Photo updated.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty('disabled', true);

    await user.click(screen.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('e-mona'));
    expect(await screen.findByText('Photo removed.')).toBeTruthy();
    expect(screen.getByTestId('photo-status').textContent).toBe(
      'No photo yet. A male or female silhouette is shown until you add one.',
    );
  });

  it('adding: the chosen photo waits for the employee to be saved (never sent while the form is invalid)', async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({ success: true, status: 201, data: { ...employee, id: 'e-new' } } as never);
    upload.mockResolvedValue(ok({ ...employee, id: 'e-new', photoUrl: '/files/employee-photos/x.png' }));
    renderForm();
    await user.upload(screen.getByLabelText('Choose a photo'), png());
    expect(screen.getByTestId('photo-status').textContent).toContain('It is added when you save the employee.');
    // No upload until the employee exists.
    expect(screen.queryByRole('button', { name: 'Upload photo' })).toBeNull();
    expect(upload).not.toHaveBeenCalled();
    // The rest of the form isn't filled: nothing is created and nothing uploaded.
    await user.click(screen.getByRole('button', { name: 'Save employee' }));
    await waitFor(() => expect(screen.getAllByText('This field is required.').length).toBeGreaterThan(0));
    expect(create).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});

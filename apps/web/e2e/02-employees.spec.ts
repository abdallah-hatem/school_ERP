import { expect, test } from '@playwright/test';
import { EmployeeStatus, type Employee, type EmployeeSummary } from '@school-erp/shared';
import { Api } from './support/api';
import { t } from './support/i18n';
import { searchField, shoot, signIn } from './support/ui';

/** A valid Egyptian mobile number that differs from `current`. */
function newPhone(current: string): string {
  for (;;) {
    const phone = `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    if (phone !== current) return phone;
  }
}

test('employees: list → open a profile → edit the phone → saved', async ({ page }, info) => {
  const api = await Api.asAdmin();
  const [employee] = await api.get<EmployeeSummary[]>('/hr/employees', {
    status: EmployeeStatus.ACTIVE,
    limit: 1,
  });
  if (!employee) throw new Error('smoke: the seed has no active employee');
  const before = await api.get<Employee>(`/hr/employees/${employee.id}`);
  const phone = newPhone(before.phone);

  await signIn(page, 'en');
  await page.goto('/en/employees');
  await expect(page.getByRole('heading', { level: 1, name: t('en', 'employees.title') })).toBeVisible();
  await shoot(page, info, 'employees-list');

  await searchField(page, t('en', 'employees.list.searchLabel')).fill(employee.code);
  await page.getByRole('link', { name: employee.nameEn, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/employees/${employee.id}$`));
  await shoot(page, info, 'employee-profile');

  await page.getByRole('link', { name: t('en', 'employees.profile.edit') }).click();
  await expect(page).toHaveURL(new RegExp(`/en/employees/${employee.id}/edit$`));
  // Anchored: the emergency contact's "Contact phone" must not match.
  const phoneInput = page.getByRole('textbox', { name: new RegExp(`^${t('en', 'employees.fields.phone')}`) });
  await phoneInput.fill(phone);
  await shoot(page, info, 'employee-edit');
  await page.getByRole('button', { name: t('en', 'employees.edit.submit') }).click();

  await expect(page).toHaveURL(new RegExp(`/en/employees/${employee.id}$`));
  await expect(page.getByText(phone, { exact: true })).toBeVisible();
  await expect.poll(async () => (await api.get<Employee>(`/hr/employees/${employee.id}`)).phone).toBe(phone);
  await api.dispose();
});

import { expect, test } from '@playwright/test';
import { EmployeeStatus } from '@school-erp/shared';
import { t } from './support/i18n';
import { activeEmployee, checkProfileTabs } from './support/profile-tabs';
import { signIn } from './support/ui';

/** Runs in the `desktop-en` project (1440×900). */

for (const locale of ['en', 'ar'] as const) {
  test(`employee profile (${locale}): switching tabs keeps the header, only the tab loads`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkProfileTabs(page, info, locale, `${locale}-desktop`);
  });
}

test('employee profile: deactivate on a tab updates the header and the tab, then reactivate', async ({ page }) => {
  const employee = await activeEmployee();
  await signIn(page, 'en');
  await page.goto(`/en/employees/${employee.id}/penalties`);
  const header = page.locator('#main header').first();
  const record = page.getByRole('button', { name: t('en', 'penalties.record') }).first();
  await expect(header.getByText(t('en', `common.enums.employeeStatus.${EmployeeStatus.ACTIVE}`))).toBeVisible();
  await expect(record).toBeVisible();

  await header.getByRole('button', { name: t('en', 'employees.status.deactivate') }).click();
  await page.getByRole('dialog').getByRole('button', { name: t('en', 'employees.status.deactivate') }).click();
  await expect(header.getByText(t('en', `common.enums.employeeStatus.${EmployeeStatus.INACTIVE}`))).toBeVisible();
  // The tab reads the layout's employee: an inactive one gets no "record penalty" button.
  await expect(record).toBeHidden();

  await header.getByRole('button', { name: t('en', 'employees.status.reactivate') }).click();
  await page.getByRole('dialog').getByRole('button', { name: t('en', 'employees.status.reactivate') }).click();
  await expect(header.getByText(t('en', `common.enums.employeeStatus.${EmployeeStatus.ACTIVE}`))).toBeVisible();
  await expect(record).toBeVisible();
});

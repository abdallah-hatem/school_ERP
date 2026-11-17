import { expect, test } from '@playwright/test';
import { t } from './support/i18n';
import { expectNoHorizontalScroll, shoot, signIn } from './support/ui';

/** Runs in the `phone-ar` project only (390×844, touch). */

test('Arabic on a phone: the date picker year menu takes a tap', async ({ page }, info) => {
  await signIn(page, 'ar');
  await page.goto('/ar/employees/new');
  const field = page.getByRole('button', { name: new RegExp(t('ar', 'employees.fields.dateOfBirth')) });
  await field.tap();
  const picker = page.getByRole('dialog');

  const year = picker.getByRole('combobox', { name: t('ar', 'ui.form.year') });
  await year.tap();
  await page.getByRole('option', { name: '1990', exact: true }).tap();
  await expect(year).toContainText('1990');
  await shoot(page, info, 'date-picker');

  await picker.getByRole('grid').getByText('15', { exact: true }).tap();
  await expect(field).toContainText('1990');
  await expectNoHorizontalScroll(page);
});

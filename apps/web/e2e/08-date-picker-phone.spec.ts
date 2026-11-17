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

test('Arabic on a phone: the change history and its pagination fit the screen', async ({ page }, info) => {
  await signIn(page, 'ar');
  await page.goto('/ar/settings?section=history');
  const nav = page.getByRole('navigation', { name: t('ar', 'ui.table.pagination') });
  await expect(nav).toBeVisible();
  // Previous · "page X of Y" · next — the numbered buttons wait for a wider screen.
  await expect(nav.getByRole('button', { name: t('ar', 'ui.table.nextPage') })).toBeVisible();
  await expect(nav.getByRole('button', { name: t('ar', 'ui.table.lastPage') })).toBeHidden();
  const box = await nav.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBeTruthy();
  await expectNoHorizontalScroll(page);
  await shoot(page, info, 'settings-history');
});

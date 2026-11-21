import { expect, test, type Page } from '@playwright/test';
import type { Language } from '@school-erp/shared';
import { t } from './support/i18n';
import { shoot, signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/*
 * The date picker's month / year pickers sit under the calendar's previous / next nav. Only a real
 * browser shows whether the nav swallows the pointer: Playwright's click refuses an element another
 * one covers ("intercepts pointer events"), exactly as a person's mouse would hit the nav instead.
 */

async function openBirthDatePicker(page: Page, locale: Language) {
  await signIn(page, locale);
  await page.goto(`/${locale}/employees/new`);
  await page.getByRole('button', { name: new RegExp(t(locale, 'employees.fields.dateOfBirth')) }).click();
  return page.getByRole('dialog');
}

for (const locale of ['en', 'ar'] as const) {
  test(`date picker (${locale}): the year and month pickers take a mouse click`, async ({ page }, info) => {
    const picker = await openBirthDatePicker(page, locale);

    const year = picker.getByRole('combobox', { name: t(locale, 'ui.form.year') });
    await year.click();
    await page.getByRole('option', { name: '1985', exact: true }).click();
    await expect(year).toContainText('1985');

    const month = picker.getByRole('combobox', { name: t(locale, 'ui.form.month') });
    await month.click();
    await page.getByRole('option').nth(2).click();
    await expect(picker.getByRole('grid')).toBeVisible();
    await shoot(page, info, `date-picker-${locale}`);

    await picker.getByRole('grid').getByText('15', { exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(page.getByRole('button', { name: new RegExp(t(locale, 'employees.fields.dateOfBirth')) })).toContainText(
      '1985',
    );
  });
}

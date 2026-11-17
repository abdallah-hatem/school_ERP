import { expect, test } from '@playwright/test';
import { adminName, changeWorkingDays, employeeEntries, expectWorkingDaysEntry, firstEntry } from './support/activity';
import { t } from './support/i18n';
import { activeEmployee } from './support/profile-tabs';
import { expectNoHorizontalScroll, settle, shoot, signIn } from './support/ui';

/** Runs in the `phone-ar` project only (390×844, touch). Activity log screens on a phone, T30. */

for (const locale of ['ar', 'en'] as const) {
  test(`activity on a phone (${locale}): filters behind one button, the change at the top`, async ({ page }, info) => {
    const admin = await adminName();
    await signIn(page, locale);
    await changeWorkingDays(page, locale);

    await page.goto(`/${locale}/activity`);
    await expectWorkingDaysEntry(firstEntry(page), locale, admin);
    // No side panel on a phone: one Filters button opens the sheet.
    await expect(page.getByRole('complementary', { name: t(locale, 'audit.filters.title') })).toBeHidden();
    const pagination = page.getByRole('navigation', { name: t(locale, 'ui.table.pagination') });
    await expect(pagination.getByRole('button', { name: t(locale, 'ui.table.nextPage') })).toBeVisible();
    await expect(pagination.getByRole('button', { name: t(locale, 'ui.table.lastPage') })).toBeHidden();
    await expectNoHorizontalScroll(page);
    await settle(page);
    await shoot(page, info, `activity-${locale}-phone`);

    await page.getByRole('button', { name: t(locale, 'audit.filters.open'), exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: t(locale, 'audit.filters.title') });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: t(locale, 'audit.filters.settings'), exact: true }).tap();
    await expect(page).toHaveURL(/module=settings/);
    await settle(page);
    await shoot(page, info, `activity-filters-${locale}-phone`);
    await sheet.getByRole('button', { name: t(locale, 'audit.filters.done') }).tap();
    await expect(sheet).toBeHidden();

    // The filter in use is a chip that removes itself; the button counts it.
    await expect(page.getByRole('button', { name: t(locale, 'audit.filters.openCount', { count: 1 }) })).toBeVisible();
    await expectWorkingDaysEntry(firstEntry(page), locale, admin);
    await page.getByRole('button', { name: t(locale, 'audit.filters.remove', { name: t(locale, 'audit.filters.settings') }) }).tap();
    await expect(page).toHaveURL(new RegExp(`/${locale}/activity$`));

    await page.goto(`/${locale}/activity?q=nothing-matches-this`);
    await expect(page.getByText(t(locale, 'audit.activity.noResultsTitle'))).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shoot(page, info, `activity-empty-${locale}-phone`);

    await changeWorkingDays(page, locale);
  });

  test(`employee History tab on a phone (${locale})`, async ({ page }, info) => {
    const employee = await activeEmployee();
    const entries = await employeeEntries(employee.id);
    await signIn(page, locale);
    await page.goto(`/${locale}/employees/${employee.id}/history`);
    await expect(page.getByRole('heading', { level: 2, name: t(locale, 'audit.history.title') })).toBeVisible();
    // TODO(T28): assert an employee edit at the top once T28 records `hr.employee.update`.
    if (entries.length === 0) await expect(page.getByText(t(locale, 'audit.history.emptyTitle'))).toBeVisible();
    else await expect(firstEntry(page)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await settle(page);
    await shoot(page, info, `history-${locale}-phone`);
  });
}

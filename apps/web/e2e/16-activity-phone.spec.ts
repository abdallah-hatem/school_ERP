import { expect, test } from '@playwright/test';
import {
  adminName,
  changeWorkingDays,
  expectGradeEntry,
  expectWorkingDaysEntry,
  firstEntry,
  setEmployeeGrade,
} from './support/activity';
import { t } from './support/i18n';
import { activeEmployee } from './support/profile-tabs';
import { schoolDay } from '../src/core/audit/lib/time';
import { expectNoHorizontalScroll, expectTapTargets, settle, shoot, signIn } from './support/ui';

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
    // Phone paging: first · previous · "Page x of y" · next · last.
    await expect(pagination.getByRole('button', { name: t(locale, 'ui.table.nextPage') })).toBeVisible();
    await expect(pagination.getByRole('button', { name: t(locale, 'ui.table.lastPage') })).toBeVisible();
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

  test(`employee History tab on a phone (${locale}): an edit of the employee is at the top`, async ({ page }, info) => {
    const employee = await activeEmployee();
    const grade = `Smoke ${locale} ${Date.now()}`;
    await setEmployeeGrade(employee.id, grade);
    try {
      await signIn(page, locale);
      await page.goto(`/${locale}/employees/${employee.id}/history`);
      await expect(page.getByRole('heading', { level: 2, name: t(locale, 'audit.history.title') })).toBeVisible();
      await expectGradeEntry(firstEntry(page), locale, grade);
      await expectNoHorizontalScroll(page);
      await settle(page);
      await shoot(page, info, `history-${locale}-phone`);
    } finally {
      await setEmployeeGrade(employee.id, employee.grade);
    }
  });
}

for (const locale of ['ar', 'en'] as const) {
  test(`activity on a phone (${locale}): every control is a 44px tap target`, async ({ page }, info) => {
    await signIn(page, locale);
    await page.goto(`/${locale}/activity`);
    await expect(firstEntry(page)).toBeVisible();
    await expectTapTargets(page.getByRole('link', { name: t(locale, 'audit.timeline.openRecord') }));
    await expectTapTargets(page.getByRole('navigation', { name: t(locale, 'ui.table.pagination') }).getByRole('button'));
    await expectTapTargets(page.getByRole('group', { name: t(locale, 'ui.shell.language') }).getByRole('button'));

    await page.getByRole('button', { name: t(locale, 'audit.filters.open'), exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: t(locale, 'audit.filters.title') });
    await expect(sheet).toBeVisible();
    await expectTapTargets(sheet.getByRole('group', { name: t(locale, 'audit.filters.module') }).getByRole('button'));
    await expectTapTargets(sheet.getByRole('group', { name: t(locale, 'audit.filters.actionType') }).getByRole('button'));
    await expectTapTargets(sheet.getByRole('group', { name: t(locale, 'audit.filters.person') }).getByRole('button'));
    await expectTapTargets(sheet.getByRole('button', { name: t(locale, 'audit.filters.close') }));
    await sheet.getByRole('button', { name: t(locale, 'audit.filters.chips.update') }).tap();
    await expect(page).toHaveURL(/type=update/);
    await expectTapTargets(sheet.getByRole('button', { name: t(locale, 'audit.filters.clear') }));

    await sheet.getByRole('button', { name: new RegExp(t(locale, 'audit.filters.dateRange')) }).tap();
    const presets = page.getByRole('button', { name: t(locale, 'audit.filters.last7') });
    await expect(presets).toBeVisible();
    await settle(page);
    await shoot(page, info, `activity-date-${locale}-phone`);
    await expectTapTargets(presets);
    await expectTapTargets(page.getByRole('button', { name: t(locale, 'audit.filters.previousMonth') }));
    await expectTapTargets(page.getByRole('gridcell').getByRole('button'));
  });

  test(`activity on a phone (${locale}): a day's header counts the whole day, not the page`, async ({ page }) => {
    await signIn(page, locale);
    const today = schoolDay(new Date());
    // Today only: the results count is the day's total, and so must the day's header be.
    await page.goto(`/${locale}/activity?from=${today}&to=${today}`);
    await expect(firstEntry(page)).toBeVisible();
    const total = (await page.getByTestId('activity-total').textContent())?.trim() ?? '';
    expect(total).not.toBe('');
    await expect(page.getByTestId('day-total').first()).toHaveText(total);
  });
}


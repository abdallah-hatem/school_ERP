import { expect, test } from '@playwright/test';
import {
  adminName,
  changeWorkingDays,
  expectGradeEntry,
  expectWorkingDaysEntry,
  firstEntry,
  renameDepartmentAr,
  setEmployeeGrade,
  shootSkeleton,
  someDepartment,
} from './support/activity';
import { t } from './support/i18n';
import { activeEmployee } from './support/profile-tabs';
import { expectNoHorizontalScroll, settle, shoot, signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Runs in the `desktop-en` project (1440×900). Activity log screens, T30. */

for (const locale of ['en', 'ar'] as const) {
  test(`activity (${locale}): a school-settings change is at the top, and behind Settings' history link`, async ({
    page,
  }, info) => {
    const admin = await adminName();
    await signIn(page, locale);
    await changeWorkingDays(page, locale);

    // The sidebar: Administration → Activity.
    await page.getByRole('link', { name: t(locale, 'common.nav.activity'), exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/activity$`));
    await expectWorkingDaysEntry(firstEntry(page), locale, admin);
    const panel = page.getByRole('complementary', { name: t(locale, 'audit.filters.title') });
    await expect(panel.getByTestId('today-at-a-glance')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await settle(page);
    await shoot(page, info, `activity-${locale}-desktop`);

    // Settings → "View change history" → Activity filtered to the settings actions.
    await page.goto(`/${locale}/settings`);
    await page.getByRole('link', { name: t(locale, 'settings.viewHistory') }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/activity\\?module=settings$`));
    await expect(panel.getByRole('button', { name: t(locale, 'audit.filters.settings'), exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectWorkingDaysEntry(firstEntry(page), locale, admin);

    // A filter narrows on the server and keeps the scroll: sign-ins only → no settings entries.
    await panel.getByRole('button', { name: t(locale, 'audit.filters.chips.signIn') }).click();
    await expect(page.getByText(t(locale, 'audit.activity.noResultsTitle'))).toBeVisible();
    await expect(page).toHaveURL(/type=signIn/);

    // Put the working days back.
    await changeWorkingDays(page, locale);
  });
}

test('activity: empty filters, the loading skeleton, then the person filter', async ({ browser, page }, info) => {
  const admin = await adminName();
  await signIn(page, 'en');

  await page.goto('/en/activity?q=nothing-matches-this');
  await expect(page.getByText(t('en', 'audit.activity.noResultsTitle'))).toBeVisible();
  await settle(page);
  await shoot(page, info, 'activity-empty-en-desktop');

  // The skeleton, as the server streams it first (JavaScript off keeps it on screen; 23-skeletons).
  for (const locale of ['en', 'ar'] as const) {
    await shootSkeleton(browser, page, info, `/${locale}/activity`, `activity-loading-${locale}-desktop`);
  }

  await page.goto('/en/activity');
  await expect(firstEntry(page)).toBeVisible();

  // The person picker: only the admin's entries.
  const panel = page.getByRole('complementary', { name: t('en', 'audit.filters.title') });
  await panel.getByRole('searchbox', { name: t('en', 'audit.filters.searchPeople') }).fill(admin.split(' ')[0] ?? admin);
  await panel.getByRole('button', { name: admin, exact: true }).click();
  await expect(page).toHaveURL(/person=/);
  await expect(firstEntry(page)).toContainText(admin);
});

for (const locale of ['en', 'ar'] as const) {
  test(`employee History tab (${locale}): an edit of the employee is at the top of their timeline`, async ({
    browser,
    page,
  }, info) => {
    const employee = await activeEmployee();
    const grade = `Smoke ${locale} ${Date.now()}`;
    await setEmployeeGrade(employee.id, grade);
    try {
      await signIn(page, locale);
      await page.goto(`/${locale}/employees/${employee.id}`);
      const tabs = page.getByRole('navigation', { name: t(locale, 'employees.profile.tabs') });
      await tabs.getByRole('link', { name: t(locale, 'employees.profile.history'), exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/employees/${employee.id}/history$`));
      await expect(page.getByRole('heading', { level: 2, name: t(locale, 'audit.history.title') })).toBeVisible();
      // T28 records `hr.employee.update` in the edit's transaction: the entry is there at once.
      await expectGradeEntry(firstEntry(page), locale, grade);
      await expectNoHorizontalScroll(page);
      await settle(page);
      await shoot(page, info, `history-${locale}-desktop`);
      await shootSkeleton(browser, page, info, `/${locale}/employees/${employee.id}/history`, `history-loading-${locale}-desktop`);
    } finally {
      await setEmployeeGrade(employee.id, employee.grade);
    }
  });
}

test('activity: a department renamed in Arabic only reads its Arabic name, the changed part on its own line', async ({
  page,
}, info) => {
  const department = await someDepartment();
  const renamed = `${department.nameAr} ت`;
  await renameDepartmentAr(department.id, renamed);
  try {
    await signIn(page, 'ar');
    const part = (locale: 'en' | 'ar') =>
      t(locale, 'audit.timeline.part', {
        field: t(locale, 'audit.fields.hr.departments'),
        part: t(locale, 'audit.fields.nameAr'),
      });
    // Recorded after the write commits: reload until it is there.
    await expect(async () => {
      await page.goto('/ar/activity?module=hr');
      await expect(firstEntry(page)).toContainText(renamed, { timeout: 2_000 });
    }).toPass();
    const entry = firstEntry(page);
    // The Arabic sentence names the record in Arabic (finding 3)…
    await expect(entry).toContainText(`${t('ar', 'audit.actions.hr.department.update').split('{')[0]}${renamed}`);
    await expect(entry).not.toContainText(department.nameEn);
    // …and the change is the Arabic name's own line, with its old and new value (finding 4).
    await expect(entry).toContainText(part('ar'));
    await expect(entry).toContainText(department.nameAr);
    await settle(page);
    await shoot(page, info, 'activity-arabic-name-ar-desktop');

    await page.goto('/en/activity?module=hr');
    await expect(firstEntry(page)).toContainText(department.nameEn);
    await expect(firstEntry(page)).toContainText(part('en'));
    await shoot(page, info, 'activity-arabic-name-en-desktop');
  } finally {
    await renameDepartmentAr(department.id, department.nameAr);
  }
});


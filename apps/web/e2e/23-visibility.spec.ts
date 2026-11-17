import { expect, test } from '@playwright/test';
import { sidebarLink } from './support/access';
import { t } from './support/i18n';
import { settle, shoot, signIn } from './support/ui';
import { expectNotFound, makeStageHead, signInAsStageHead } from './support/visibility';

/**
 * Runs in the `desktop-en` project (1440×900). P4 — what each role can see: a Stage head linked to
 * an employee sees only their stage's employees, no salary anywhere, no Payroll / History tabs and
 * no payroll pages; the HR manager (the seeded admin) still sees everything.
 */

test('a Stage head sees only their stage, no salary, no Payroll or History; the HR manager sees all', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const setup = await makeStageHead();
  for (const locale of ['en', 'ar'] as const) {
    const head = await signInAsStageHead(browser, setup, locale, { width: 1440, height: 900 }, 'stage-head-own-password-1');

    // Sidebar: Employees and Penalties; no Lateness, Payroll, Activity, Users or Roles.
    await head.goto(`/${locale}`);
    await expect(sidebarLink(head, locale, 'employees')).toBeVisible();
    await expect(sidebarLink(head, locale, 'penalties')).toBeVisible();
    for (const hidden of ['lateness', 'payroll', 'activity', 'users', 'roles']) {
      await expect(sidebarLink(head, locale, hidden)).toHaveCount(0);
    }
    await settle(head);
    await shoot(head, info, `p4-stage-head-dashboard-${locale}-desktop`);

    // Employees: only their stage; no salary on any card.
    await head.goto(`/${locale}/employees`);
    const cards = head.getByRole('article');
    await expect(cards.first()).toBeVisible();
    const shown = await cards.count();
    // First that every card is someone of their stage (the scope), then the count: a full page, or
    // the whole stage when it fits on one.
    const names = setup.inStage.map((e) => (locale === 'ar' ? e.nameAr : e.nameEn));
    for (let i = 0; i < shown; i++) {
      const name = (await cards.nth(i).getAttribute('aria-label')) ?? (await cards.nth(i).getByRole('heading').textContent());
      expect(names).toContain(name?.trim());
    }
    expect(shown).toBe(Math.min(setup.inStage.length, 12));
    await expect(head.getByText(t(locale, 'employees.columns.basicSalary'))).toHaveCount(0);
    await settle(head);
    await shoot(head, info, `p4-stage-head-employees-${locale}-desktop`);

    // Their own profile: Details and Penalties only, no salary or bank details.
    await head.goto(`/${locale}/employees/${setup.own.id}`);
    const tabs = head.getByRole('navigation', { name: t(locale, 'employees.profile.tabs') }).getByRole('link');
    await expect(tabs).toHaveText([t(locale, 'employees.profile.details'), t(locale, 'common.nav.penalties')]);
    await expect(head.getByText(t(locale, 'employees.fields.basicSalary'))).toHaveCount(0);
    await expect(head.getByRole('heading', { name: t(locale, 'employees.sections.bank') })).toHaveCount(0);
    await settle(head);
    await shoot(head, info, `p4-stage-head-profile-${locale}-desktop`);

    // Edge case 3: another stage's employee, the payroll pages, the History tab → not found.
    await head.goto(`/${locale}/employees/${setup.outside.id}`);
    await expectNotFound(head, locale);
    await head.goto(`/${locale}/payroll`);
    await expectNotFound(head, locale);
    await head.goto(`/${locale}/employees/${setup.own.id}/payroll`);
    await expectNotFound(head, locale);
    await head.goto(`/${locale}/employees/${setup.own.id}/history`);
    await expectNotFound(head, locale);
    await shoot(head, info, `p4-stage-head-not-found-${locale}-desktop`);
    await head.context().close();
  }

  // The HR manager (seeded admin: System admin + HR manager) still sees everything.
  await signIn(page, 'en');
  await page.goto(`/en/employees/${setup.own.id}`);
  const tabs = page.getByRole('navigation', { name: t('en', 'employees.profile.tabs') }).getByRole('link');
  await expect(tabs).toHaveCount(4);
  await expect(page.getByText(t('en', 'employees.fields.basicSalary'))).toBeVisible();
  await settle(page);
  await shoot(page, info, 'p4-hr-manager-profile-en-desktop');
  await page.goto('/en/employees');
  await expect(page.getByText(t('en', 'employees.columns.basicSalary')).first()).toBeVisible();
  await shoot(page, info, 'p4-hr-manager-employees-en-desktop');
});

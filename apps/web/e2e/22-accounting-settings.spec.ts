import { expect, test } from '@playwright/test';
import { Api } from './support/api';
import { makeUser, rolesByKey, sidebarLink, signInAs } from './support/access';
import { checkAccountingSettings } from './support/accounting-settings';
import { t } from './support/i18n';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Settings → Accounting on a desktop, English then Arabic (§10). */
for (const locale of ['en', 'ar'] as const) {
  test(`Settings → Accounting: the tax rule and its live example (${locale})`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkAccountingSettings(page, info, locale, locale);
  });
}

/** The Accountant edits the rule (§10): Settings is in their menu and opens on Accounting. */
test('an Accountant opens Settings from the menu and lands on Accounting, which they can edit', async ({
  page: admin,
  browser,
}, info) => {
  const locale = 'en';
  const api = await Api.asAdmin();
  const accountant = (await rolesByKey(api)).get('accountant');
  if (!accountant) throw new Error('The built-in Accountant role is missing');
  const user = await makeUser(api, { name: 'Smoke Accountant', roleIds: [accountant.id] });
  await api.dispose();

  const context = await browser.newContext({ locale: 'en-US', viewport: admin.viewportSize() });
  const page = await context.newPage();
  await signInAs(page, locale, user.email, user.password);
  const own = 'accountant-own-password-1';
  await page.getByRole('textbox', { name: t(locale, 'auth.password.new'), exact: true }).fill(own);
  await page.getByRole('textbox', { name: t(locale, 'auth.password.confirm'), exact: true }).fill(own);
  await page.getByRole('button', { name: t(locale, 'auth.setPassword.submit') }).click();

  await sidebarLink(page, locale, 'settings').click();
  await expect(page).toHaveURL(/\/en\/settings/);
  await expect(page.getByText(t(locale, 'settings.accounting.tax.title')).first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: t(locale, 'settings.accounting.tax.restRateLabel') })).toBeEnabled();
  await expect(page.getByRole('button', { name: t(locale, 'settings.accounting.tax.addBracket') })).toBeVisible();
  // The other sections aren't theirs: not listed.
  await expect(
    page.getByRole('navigation', { name: t(locale, 'settings.sectionsLabel') }).getByRole('button'),
  ).toHaveCount(1);
  await checkAccountingSettings(page, info, locale, 'accountant');
  await context.close();
});

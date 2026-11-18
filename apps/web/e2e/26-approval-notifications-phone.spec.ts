import { expect, test } from '@playwright/test';
import { Api } from './support/api';
import { t } from './support/i18n';
import { recordPenaltyToday } from './support/penalties';
import { expectNoHorizontalScroll, settle, shoot, signIn } from './support/ui';

/**
 * Runs in the `phone-ar` project only (390×844, touch): a notification's link to one penalty
 * (`/ar/penalties?penalty=<id>`, §11, N2) opens it over its month's list, in Arabic, at phone width;
 * an id the viewer can't open is "This page isn't here".
 */
const locale = 'ar' as const;

test('a penalty link opens that penalty in Arabic on a phone', async ({ page }, info) => {
  test.setTimeout(120_000);
  const api = await Api.asAdmin();
  const penalty = await recordPenaltyToday(api);
  await api.dispose();

  await signIn(page, locale);
  await page.goto(`/${locale}/penalties?penalty=${penalty.id}`);
  const details = page.getByRole('dialog', { name: t(locale, 'penalties.details.title') });
  await expect(details).toBeVisible();
  await expect(details).toContainText(penalty.employee.nameAr);
  await expect(details).toContainText(penalty.violation.nameAr);
  await expect(details.getByRole('button', { name: t(locale, 'penalties.approve.button') })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await settle(page);
  await shoot(page, info, 'penalty-deep-link-ar-phone');

  // Unknown id → the not-found screen, nothing about any penalty.
  await page.goto(`/${locale}/penalties?penalty=00000000-0000-4000-8000-000000000000`);
  await expect(page.getByRole('dialog', { name: t(locale, 'penalties.details.title') })).toHaveCount(0);
  await expect(page.getByText(t(locale, 'ui.states.notFoundTitle'))).toBeVisible();
});

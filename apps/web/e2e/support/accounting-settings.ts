import { expect, type Page, type TestInfo } from '@playwright/test';
import type { Language } from '@school-erp/shared';
import { t } from './i18n';
import { expectNoHorizontalScroll, settle, shoot } from './ui';

/**
 * Settings → Accounting (§10): the payroll tax rule with its defaults and the live example from
 * the shared gross-up (net 10,000.00 → tax 1,017.00 · fund 5.51 · gross 11,022.51).
 */
export async function checkAccountingSettings(page: Page, info: TestInfo, locale: Language, name: string) {
  await page.goto(`/${locale}/settings?section=accounting`);
  await expect(page.getByText(t(locale, 'settings.accounting.tax.title')).first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText(t(locale, 'settings.accounting.tax.restLabel'), { exact: true })).toBeVisible();
  await expect(page.getByTestId('tax-example')).toContainText('1,017.00');
  await expect(page.getByTestId('tax-example')).toContainText('11,022.51');
  await expectNoHorizontalScroll(page);
  await settle(page);
  await shoot(page, info, `accounting-settings-${name}`);
}

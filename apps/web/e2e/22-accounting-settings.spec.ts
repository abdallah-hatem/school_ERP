import { test } from '@playwright/test';
import { checkAccountingSettings } from './support/accounting-settings';
import { signIn } from './support/ui';

/** Settings → Accounting on a desktop, English then Arabic (§10). */
for (const locale of ['en', 'ar'] as const) {
  test(`Settings → Accounting: the tax rule and its live example (${locale})`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkAccountingSettings(page, info, locale, locale);
  });
}

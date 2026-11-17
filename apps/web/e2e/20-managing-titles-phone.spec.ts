import { test } from '@playwright/test';
import { checkManagingTitles } from './support/managing-titles';
import { signIn } from './support/ui';

/** Phone (390×844): the same flow — the switch dialog and the picker at phone width. */
for (const locale of ['ar', 'en'] as const) {
  test(`managing job titles on a phone (${locale})`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkManagingTitles(page, info, locale, `phone-${locale}`);
  });
}

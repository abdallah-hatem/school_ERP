import { test } from '@playwright/test';
import { checkManagingTitles } from './support/managing-titles';
import { signIn } from './support/ui';

/** §3 direct managers: Settings' "Manages people" switch decides who the manager picker lists. */
for (const locale of ['en', 'ar'] as const) {
  test(`managing job titles (${locale}): switch on in Settings → the picker lists that title, not others`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkManagingTitles(page, info, locale, `desktop-${locale}`);
  });
}

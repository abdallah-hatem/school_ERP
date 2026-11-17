import { test } from '@playwright/test';
import { checkPickersAndMenus } from './support/pickers-menus';
import { signIn } from './support/ui';

for (const locale of ['en', 'ar'] as const) {
  test(`pickers and row menus (${locale}, desktop): search above 6 options, actions behind ⋯`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkPickersAndMenus(page, info, locale, `${locale}-desktop`);
  });
}

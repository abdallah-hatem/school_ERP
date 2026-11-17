import { test } from '@playwright/test';
import { checkPickersAndMenus } from './support/pickers-menus';
import { signIn } from './support/ui';

/** Runs in the `phone-ar` project only (390×844). */
for (const locale of ['ar', 'en'] as const) {
  test(`pickers and row menus (${locale}, phone): search above 6 options, actions behind ⋯`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkPickersAndMenus(page, info, locale, `${locale}-phone`);
  });
}

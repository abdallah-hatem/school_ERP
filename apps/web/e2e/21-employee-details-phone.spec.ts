import { test } from '@playwright/test';
import { checkEmployeeDetails } from './support/employee-details';
import { signIn } from './support/ui';

/** Runs in the `phone-ar` project only (390×844). */
for (const [i, locale] of (['ar', 'en'] as const).entries()) {
  test(`employee details (${locale}, phone): edit insurance + bank, see them on the profile; photo vs silhouette`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkEmployeeDetails(page, info, locale, `${locale}-phone`, i + 2);
  });
}

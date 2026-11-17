import { test } from '@playwright/test';
import { checkGenderedAvatars } from './support/gendered-avatars';
import { signIn } from './support/ui';

/** Runs in the `phone-ar` project only (390×844). */
for (const locale of ['ar', 'en'] as const) {
  test(`gendered avatars (${locale}, phone): male and female silhouettes, the photo wins — cards, penalties, profile`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkGenderedAvatars(page, info, locale, `${locale}-phone`);
  });
}

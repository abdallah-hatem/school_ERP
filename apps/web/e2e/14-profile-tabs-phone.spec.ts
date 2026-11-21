import { test } from '@playwright/test';
import { checkProfileTabs } from './support/profile-tabs';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Runs in the `phone-ar` project only (390×844). */
for (const locale of ['ar', 'en'] as const) {
  test(`employee profile (${locale}, phone): switching tabs keeps the header, only the tab loads`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkProfileTabs(page, info, locale, `${locale}-phone`);
  });
}

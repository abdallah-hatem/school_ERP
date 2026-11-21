import { test } from '@playwright/test';
import { checkAccountingSettings } from './support/accounting-settings';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Settings → Accounting on a phone (390×844), English then Arabic (§10). */
for (const locale of ['en', 'ar'] as const) {
  test(`Settings → Accounting on a phone (${locale})`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkAccountingSettings(page, info, locale, `${locale}-phone`);
  });
}

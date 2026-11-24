import { test } from '@playwright/test';
import { checkContracts } from './support/contracts';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Runs in the `phone-ar` project only (390×844): the same flow on the phone cards, in Arabic. */
test('contract renewals (phone): renewed from its card; the Contracts tab shows the history', async ({ page }, info) => {
  test.setTimeout(120_000);
  await signIn(page, 'ar');
  await checkContracts(page, info, 'ar', 'phone-ar');
});

import { test } from '@playwright/test';
import { checkContracts } from './support/contracts';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/**
 * Runs in the `desktop-en` project (1440×900). Contracts (spec 2026-11-24): an employee created
 * through the API shows on the renewals screen with its tiles, is renewed from its row (the pill
 * turns "Renewed"), and its Contracts tab lists both contracts.
 */
test('contract renewals: a new employee’s contract is renewed from its row; the Contracts tab shows the history', async ({ page }, info) => {
  test.setTimeout(120_000);
  await signIn(page, 'en');
  await checkContracts(page, info, 'en', 'desktop-en');
});

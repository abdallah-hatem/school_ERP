import { test } from '@playwright/test';
import { checkContractTemplates } from './support/contract-templates';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/**
 * Runs in the `phone-ar` project only (390×844): the same flow in Arabic — the Fields bottom sheet,
 * the full-screen print dialog, and "Print or PDF" opening the PDF where the browser can't share
 * files (edge case 18).
 */
test('contract templates (phone): editor field sheet, print preview and a kept copy', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signIn(page, 'ar');
  await checkContractTemplates(page, info, 'ar', 'phone-ar');
});

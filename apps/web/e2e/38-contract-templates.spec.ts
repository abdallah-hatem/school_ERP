import { test } from '@playwright/test';
import { checkContractTemplates } from './support/contract-templates';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/**
 * Runs in the `desktop-en` project (1440×900). Contract templates (spec 2026-11-24): the seed
 * template is listed and edited (a field chip from the Fields panel); a new employee's contract
 * prints with it, filled and paginated; Download PDF keeps a copy on the contract whose PDF has
 * the preview's page count (edge case 26).
 */
test('contract templates: list, editor, print preview and a kept copy', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signIn(page, 'en');
  await checkContractTemplates(page, info, 'en', 'desktop-en');
});

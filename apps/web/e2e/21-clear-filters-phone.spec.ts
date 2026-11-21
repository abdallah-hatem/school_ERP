import { test } from '@playwright/test';
import { checkClearFilters } from './support/clear-filters';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Phone (390×844): the toolbar wraps and "Clear filters · n" stays in view. */
for (const locale of ['en', 'ar'] as const) {
  test(`clear filters on a phone (${locale}): employees and penalties`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkClearFilters(page, info, locale, `${locale}-phone`, true);
  });
}

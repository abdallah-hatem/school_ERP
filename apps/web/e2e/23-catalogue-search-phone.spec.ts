import { test } from '@playwright/test';
import { checkCatalogueSearch, showOncePerDaySwitch } from './support/catalogue-search';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** §7 on a phone, in Arabic: the catalogue search and the "Once per day" switch fit the screen. */
test('catalogue search on a phone (ar): finds a violation, empty state with Clear filters', async ({ page }, info) => {
  await signIn(page, 'ar');
  await checkCatalogueSearch(page, info, 'ar', 'phone-ar');
  await showOncePerDaySwitch(page, info, 'ar', 'phone-ar');
});

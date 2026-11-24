import { test } from '@playwright/test';
import { checkGrades } from './support/grades';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Phone (390×844): the same flow — the Grades cards, the dialogs and the picker at phone width. */
for (const locale of ['ar', 'en'] as const) {
  test(`grades on a phone (${locale})`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkGrades(page, info, locale, `phone-${locale}`);
  });
}

import { test } from '@playwright/test';
import { checkPenaltyActions } from './support/penalty-actions';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Phone (390×844): the same flow — the Penalty actions cards, the dialogs and the level editor. */
for (const locale of ['ar', 'en'] as const) {
  test(`penalty actions on a phone (${locale})`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkPenaltyActions(page, info, locale, `phone-${locale}`);
  });
}

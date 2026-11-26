import { test } from '@playwright/test';
import { checkPenaltyActions } from './support/penalty-actions';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Spec 2026-11-25: Settings → Penalty actions — adding an action, and choosing it on a level. */
for (const locale of ['en', 'ar'] as const) {
  test(`penalty actions (${locale}): the list, Add action, and a level that picks a %`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkPenaltyActions(page, info, locale, `desktop-${locale}`);
  });
}

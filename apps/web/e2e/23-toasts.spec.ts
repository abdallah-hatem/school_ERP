import { test } from '@playwright/test';
import { checkToastsAndStatus } from './support/toasts';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

for (const [i, locale] of (['en', 'ar'] as const).entries()) {
  test(`toasts and the status pair (${locale}): every toast type in the Campus look; Deactivate vs Reactivate`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkToastsAndStatus(page, info, locale, locale, i);
  });
}

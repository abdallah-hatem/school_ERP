import { test } from '@playwright/test';
import { checkToastsAndStatus } from './support/toasts';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** Runs in the `phone-ar` project only (390×844, touch): the same checks at phone width. */
for (const [i, locale] of (['ar', 'en'] as const).entries()) {
  test(`toasts and the status pair on a phone (${locale})`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await signIn(page, locale);
    await checkToastsAndStatus(page, info, locale, `${locale}-phone`, i + 2);
  });
}

import { test } from '@playwright/test';
import { checkGenderedAvatars } from './support/gendered-avatars';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

for (const locale of ['en', 'ar'] as const) {
  test(`gendered avatars (${locale}): male and female silhouettes, the photo wins — cards, penalties, profile`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkGenderedAvatars(page, info, locale, locale);
  });
}

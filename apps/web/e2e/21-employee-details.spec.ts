import { test } from '@playwright/test';
import { checkEmployeeDetails } from './support/employee-details';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

for (const [i, locale] of (['en', 'ar'] as const).entries()) {
  test(`employee details (${locale}): edit insurance + bank on the form, see them on the profile; photo vs silhouette`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkEmployeeDetails(page, info, locale, locale, i);
  });
}

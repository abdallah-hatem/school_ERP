import { test } from '@playwright/test';
import { checkEmployeeLinks } from './support/employee-links';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

for (const locale of ['en', 'ar'] as const) {
  test(`employee names link to the profile (${locale}): payroll run → profile; penalties and lateness`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkEmployeeLinks(page, info, locale, locale, false);
  });
}

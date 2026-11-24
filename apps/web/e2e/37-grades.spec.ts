import { test } from '@playwright/test';
import { checkGrades } from './support/grades';
import { signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** §3 (owner, 2026-11-24): the Grades list in Settings, and picking a grade on the employee form. */
for (const locale of ['en', 'ar'] as const) {
  test(`grades (${locale}): managed in Settings, picked on the employee form, kept when hidden`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkGrades(page, info, locale, `desktop-${locale}`);
  });
}

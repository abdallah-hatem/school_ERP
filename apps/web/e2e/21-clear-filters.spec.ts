import { test } from '@playwright/test';
import { checkClearFilters } from './support/clear-filters';
import { signIn } from './support/ui';

/** Desktop (1440×900): "Clear filters · n" on the employees and penalties lists. */
for (const locale of ['en', 'ar'] as const) {
  test(`clear filters (${locale}): employees and penalties`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkClearFilters(page, info, locale, locale, false);
  });
}

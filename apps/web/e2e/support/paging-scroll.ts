import { expect, test } from '@playwright/test';
import { t } from './i18n';
import { signIn } from './ui';

/**
 * Paging brings the list back into view: from the bottom of the employee cards, Next page leaves
 * the first card of the new page on screen (below the sticky top bar), not the bottom of the page.
 */
export function pagingScrollSpecs(locale: 'en' | 'ar') {
  test(`paging (${locale}): the next page of employee cards opens at its top`, async ({ page }) => {
    await signIn(page, locale);
    await page.goto(`/${locale}/employees`);
    const list = page.getByRole('region', { name: t(locale, 'employees.list.label') });
    const firstCard = list.getByRole('link').first();
    await expect(firstCard).toBeVisible();
    const firstName = await firstCard.textContent();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole('button', { name: t(locale, 'ui.table.nextPage'), exact: true }).click();
    await expect(list.getByRole('link').first()).not.toHaveText(firstName ?? '');

    await expect
      .poll(async () => {
        const box = await list.getByRole('link').first().boundingBox();
        const viewport = page.viewportSize();
        return box !== null && viewport !== null && box.y >= 0 && box.y < viewport.height;
      })
      .toBe(true);
  });
}

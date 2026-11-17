import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/ui';

/** Runs in the `desktop-en` project (1440×900). */

/** The sidebar panel covers the whole viewport height, from top to bottom. */
async function expectSidebarCoversViewport(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const panel = page.getByTestId('sidebar-column');
  const menu = page.locator('aside').filter({ visible: true });
  for (const box of [await panel.boundingBox(), await menu.boundingBox()]) {
    expect(box).not.toBeNull();
    // Within a pixel: scroll positions and sticky offsets land on half pixels.
    expect(box!.y).toBeLessThanOrEqual(1);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
  }
}

for (const locale of ['en', 'ar'] as const) {
  test(`sidebar spans the full height when the employees page is scrolled to the bottom (${locale})`, async ({
    page,
  }) => {
    await signIn(page, locale);
    await page.goto(`/${locale}/employees`);
    await expect(page.getByRole('article').first()).toBeVisible();
    // The page is taller than the window, or this proves nothing.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(900);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expectSidebarCoversViewport(page);
  });
}

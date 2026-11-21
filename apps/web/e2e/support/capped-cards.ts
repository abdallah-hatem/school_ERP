import { expect, test, type Page } from '@playwright/test';
import { PAGINATION, type AccountingPayrollMonthSummary, type Language } from '@school-erp/shared';
import { Api } from './api';
import { ensureApprovedRun } from './skeletons';
import { shoot, signIn } from './ui';

/*
 * The Approved payroll month's employee cards (owner, 2026-11-21): on a tablet or desktop they
 * scroll inside a box of about the window's height — the search above it and the pagination under
 * it stay put while the cards scroll — so the page isn't one very long list. On a phone the cards
 * flow with the page (one scroll, no box inside it). Opens an approved month (05-payroll's on
 * desktop; the phone pass approves one, see ensureApprovedRun).
 */

async function approvedMonth(): Promise<string> {
  const api = await Api.asAdmin();
  try {
    await ensureApprovedRun(api);
    const months = await api.get<AccountingPayrollMonthSummary[]>('/accounting/payroll', { limit: PAGINATION.maxLimit });
    if (!months[0]) throw new Error('smoke: no approved payroll month');
    return months[0].month;
  } finally {
    await api.dispose();
  }
}

async function open(page: Page, locale: Language): Promise<void> {
  const month = await approvedMonth();
  await signIn(page, locale);
  await page.goto(`/${locale}/accounting/payroll/${month}`);
  await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
}

const LIST = 'section[data-cards-below="always"] ul[data-view="cards"]';
const PAGINATION_BLOCK = 'section[data-cards-below="always"] [data-skeleton-block="pagination"]';

export function defineCappedCardSpecs(locale: Language, mode: 'capped' | 'flows'): void {
  if (mode === 'capped') {
    test(`approved payroll month: the cards scroll inside their box, the pagination stays in sight (${locale})`, async ({ page }, info) => {
      await open(page, locale);
      const list = page.locator(LIST);
      const box = await list.evaluate((el) => {
        const style = getComputedStyle(el);
        return { overflowY: style.overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
      });
      expect(box.overflowY).toBe('auto');
      const viewport = page.viewportSize()!;
      // About the window's height (less the top bar, title and pagination), never under 26rem.
      expect(box.clientHeight).toBeLessThanOrEqual(Math.max(26 * 16, viewport.height - 14 * 16) + 1);
      expect(box.scrollHeight, 'more cards than the box shows (else nothing to scroll)').toBeGreaterThan(box.clientHeight);

      // Bring the card list's section to the top, as a reader scrolling down to it: the search, the
      // box and the pagination all fit the window.
      await page.locator('section[data-cards-below="always"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      const pageY = await page.evaluate(() => window.scrollY);
      const before = await page.locator(PAGINATION_BLOCK).boundingBox();

      // Wheel over the cards: the box scrolls, the page doesn't, the pagination doesn't move.
      const listBox = (await list.boundingBox())!;
      await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + Math.min(listBox.height / 2, 200));
      await page.mouse.wheel(0, 600);
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
      const after = (await page.locator(PAGINATION_BLOCK).boundingBox())!;
      expect(after.y).toBe(before!.y);
      expect(after.y + after.height, 'the pagination is inside the window').toBeLessThanOrEqual(viewport.height);
      expect(after.y).toBeGreaterThanOrEqual(0);
      await shoot(page, info, `capped-cards-${locale}`);
    });
  } else {
    test(`approved payroll month: on a phone the cards flow with the page, no inner scroll (${locale})`, async ({ page }, info) => {
      await open(page, locale);
      const list = page.locator(LIST);
      const box = await list.evaluate((el) => ({ overflowY: getComputedStyle(el).overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
      expect(box.overflowY).toBe('visible');
      expect(box.scrollHeight).toBe(box.clientHeight);
      await shoot(page, info, `capped-cards-phone-${locale}`);
    });
  }
}

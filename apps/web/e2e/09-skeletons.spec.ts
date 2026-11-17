import { expect, test, type Browser, type Page } from '@playwright/test';
import { PAGINATION, type PayrollRunSummary } from '@school-erp/shared';
import { Api } from './support/api';
import { t } from './support/i18n';
import { signIn } from './support/ui';

/*
 * Skeletons match the content they stand in for: the same blocks at the same place and size, so
 * nothing jumps when the data arrives (owner, 2026-11-17).
 *
 * The loading state is read from the server's first paint with JavaScript off: the page streams
 * the route's skeleton (the Suspense fallback) and the real content arrives hidden, swapped in by
 * a script that never runs — so the skeleton stays on screen to be measured. The loaded state is
 * the same URL with JavaScript on.
 */

type Box = { x: number; y: number; width: number; height: number };
const TOLERANCE = 3;

async function boxesOf(page: Page, selectors: Record<string, string>): Promise<Record<string, Box | null>> {
  return page.evaluate((sel) => {
    const out: Record<string, Box | null> = {};
    for (const [name, css] of Object.entries(sel)) {
      // `css` may end in ` <parent>`: measure the parent of the match (a tile's grid).
      const parent = css.endsWith(' <parent>');
      const el = document.querySelector(parent ? css.slice(0, -' <parent>'.length) : css);
      const target = parent ? el?.parentElement : el;
      if (!target) {
        out[name] = null;
        continue;
      }
      const r = target.getBoundingClientRect();
      out[name] = { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height };
    }
    return out;
  }, selectors);
}

/** The skeleton's boxes (JavaScript off) and the loaded page's boxes for the same URL. */
async function measure(browser: Browser, page: Page, url: string, selectors: Record<string, string>, ready: () => Promise<void>) {
  const noScript = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: false,
    viewport: page.viewportSize(),
    baseURL: new URL(page.url()).origin,
  });
  const skeletonPage = await noScript.newPage();
  await skeletonPage.goto(url);
  await expect(skeletonPage.locator('#main [aria-busy="true"]').first()).toBeAttached();
  const skeleton = await boxesOf(skeletonPage, selectors);
  await noScript.close();

  await page.goto(url);
  await ready();
  await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
  const loaded = await boxesOf(page, selectors);
  return { skeleton, loaded };
}

function expectSameBox(name: string, skeleton: Box | null, loaded: Box | null, keys: (keyof Box)[] = ['x', 'y', 'width', 'height']) {
  expect(skeleton, `${name}: drawn while loading`).not.toBeNull();
  expect(loaded, `${name}: drawn once loaded`).not.toBeNull();
  for (const key of keys) {
    expect(Math.abs(skeleton![key] - loaded![key]), `${name}.${key}: skeleton ${skeleton![key]} vs loaded ${loaded![key]}`).toBeLessThanOrEqual(TOLERANCE);
  }
}

test('dashboard: the skeleton has the tiles and quick links where they load', async ({ page, browser }) => {
  await signIn(page, 'en');
  const { skeleton, loaded } = await measure(
    browser,
    page,
    '/en',
    {
      main: '#main > div',
      header: '#main header',
      tiles: '#main [class*="@container/tile"] <parent>',
      firstTile: '#main [class*="@container/tile"]',
      quickLinks: '#main section:last-of-type',
    },
    () => expect(page.getByRole('link', { name: new RegExp(t('en', 'dashboard.headcount.label')) })).toBeVisible(),
  );
  for (const name of ['main', 'header', 'tiles', 'firstTile', 'quickLinks'] as const) {
    expectSameBox(name, skeleton[name] ?? null, loaded[name] ?? null);
  }
});

test('payroll run: the skeleton has the header, tiles and lines table where they load', async ({ page, browser }) => {
  const api = await Api.asAdmin();
  const runs = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', { limit: PAGINATION.maxLimit });
  await api.dispose();
  test.skip(runs.length === 0, 'no payroll run to open');
  const run = runs[0]!;

  await signIn(page, 'en');
  const { skeleton, loaded } = await measure(
    browser,
    page,
    `/en/payroll/${run.id}`,
    {
      header: '#main header',
      tiles: '#main [class*="@container/tile"] <parent>',
      firstTile: '#main [class*="@container/tile"]',
      lines: '#main section[data-cards-below]',
      linesToolbar: '#main section[data-cards-below] > div:first-child',
      linesHeader: '#main section[data-cards-below] thead',
    },
    () => expect(page.getByTestId('lines-count')).toBeVisible(),
  );
  // A pending-penalties notice (data the skeleton can't know) sits between the header and the
  // tiles and pushes what follows down; without one, everything keeps its place.
  const notice = (await page.locator('#main [role="note"]').count()) > 0;
  const placed: (keyof Box)[] = notice ? ['x', 'width', 'height'] : ['x', 'y', 'width', 'height'];
  expectSameBox('header', skeleton.header ?? null, loaded.header ?? null);
  expectSameBox('tiles', skeleton.tiles ?? null, loaded.tiles ?? null, placed);
  expectSameBox('firstTile', skeleton.firstTile ?? null, loaded.firstTile ?? null, placed);
  expectSameBox('lines', skeleton.lines ?? null, loaded.lines ?? null, notice ? ['x', 'width'] : ['x', 'y', 'width']);
  expectSameBox('linesToolbar', skeleton.linesToolbar ?? null, loaded.linesToolbar ?? null, ['width', 'height']);
  expectSameBox('linesHeader', skeleton.linesHeader ?? null, loaded.linesHeader ?? null, ['width', 'height']);
});

import { expect, type Locator, type Page } from '@playwright/test';

/*
 * Tab switches move the current marker once (owner, 2026-11-21: "for a split second the green
 * highlight goes back to the tab I left, then returns"). A recorder in the page logs, on every
 * animation frame and every DOM change, which items say they are current (`aria-current`,
 * `aria-selected`, `aria-pressed`), which ones visibly carry the marker (the current item's tint or
 * underline colour, at any opacity — so a cross-fade shows up as two), and whether the page's
 * `<h1>` is still the same node. After a click the log must read: the old item, then the clicked
 * one — never both at once, never back to the old one — with the header never replaced.
 */

type Frame = { current: string[]; marked: string[]; h1Same: boolean };
type TabWindow = Window & { __tabLog?: Frame[]; __tabStop?: () => void };

/** Starts recording `items` inside `scope` (CSS selectors). The marker colour is read off the current item now. */
export async function recordTabs(page: Page, scope: string, items: string): Promise<void> {
  await page.evaluate(
    ({ scope, items }) => {
      const w = window as TabWindow;
      w.__tabStop?.();
      const rgb = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).join(',');
      const alpha = (c: string) => {
        if (c === 'transparent') return 0;
        const parts = c.match(/[\d.]+/g) ?? [];
        return parts.length >= 4 ? Number(parts[3]) : 1;
      };
      const all = () => Array.from(document.querySelector(scope)?.querySelectorAll(items) ?? []);
      const isCurrent = (el: Element) =>
        !!el.getAttribute('aria-current') || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true';
      const first = all().find(isCurrent);
      if (!first) throw new Error(`tab-switch: no current item in ${scope}`);
      const style = getComputedStyle(first);
      // The marker is a fill (Settings' section list, segments) or an underline (record tabs).
      const fill = alpha(style.backgroundColor) > 0 ? rgb(style.backgroundColor) : null;
      const line = parseFloat(style.borderBottomWidth) >= 2 && alpha(style.borderBottomColor) > 0 ? rgb(style.borderBottomColor) : null;
      const marked = (el: Element) => {
        const s = getComputedStyle(el);
        if (fill) return rgb(s.backgroundColor) === fill && alpha(s.backgroundColor) > 0.02;
        if (line) return rgb(s.borderBottomColor) === line && alpha(s.borderBottomColor) > 0.02;
        return false;
      };
      const label = (el: Element) => (el.textContent ?? '').trim();
      const h1 = document.querySelector('#main h1');
      const log: Frame[] = [];
      const sample = () => {
        const els = all();
        const frame = {
          current: els.filter(isCurrent).map(label),
          marked: els.filter(marked).map(label),
          h1Same: !!h1 && h1.isConnected && document.querySelector('#main h1') === h1,
        };
        const last = log[log.length - 1];
        if (!last || JSON.stringify(last) !== JSON.stringify(frame)) log.push(frame);
      };
      let running = true;
      const tick = () => {
        sample();
        if (running) requestAnimationFrame(tick);
      };
      const observer = new MutationObserver(sample);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true });
      requestAnimationFrame(tick);
      sample();
      w.__tabLog = log;
      w.__tabStop = () => {
        running = false;
        observer.disconnect();
      };
    },
    { scope, items },
  );
}

/**
 * Clicks `tab` (with the recorder running) and waits until it is current and the page is idle,
 * then checks the log: the marker went from the `from` tab straight to the clicked one, the
 * attribute did too, and the header stayed the same node.
 */
export async function switchTab(page: Page, from: Locator, tab: Locator): Promise<void> {
  const [fromText, to] = await Promise.all([from.textContent(), tab.textContent()]);
  const before = (fromText ?? '').trim();
  const after = (to ?? '').trim();
  await tab.click();
  await expect(tab).toHaveAttribute('aria-current', /.+/);
  await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
  // A few more frames, so a late re-render (the server's page, a fade) would still be caught.
  await page.waitForTimeout(400);
  const log = await page.evaluate(() => {
    const w = window as TabWindow;
    w.__tabStop?.();
    return w.__tabLog ?? [];
  });
  const steps = (key: 'current' | 'marked') =>
    log.map((f) => f[key].join(' + ')).filter((v, i, all) => i === 0 || v !== all[i - 1]);
  expect(steps('current'), `aria-current, ${before} → ${after}`).toEqual([before, after]);
  expect(steps('marked'), `the visible marker, ${before} → ${after}`).toEqual([before, after]);
  expect(log.every((f) => f.h1Same), `the header stays mounted, ${before} → ${after}`).toBe(true);
}

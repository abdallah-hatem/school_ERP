import { test, type Page } from '@playwright/test';

/*
 * A page streams in: the server sends the shell with a fallback, then each finished Suspense
 * boundary as a hidden `<div hidden id="S:n">`, and React's inline reveal (`$RC` → `$RV`, on the
 * next animation frame) swaps it into place. Until that swap the content exists twice — the hidden
 * copy and, once hydration renders it, the visible one — so a one-shot read in that window
 * (`textContent()`, `evaluate()`, a strict locator) sees two elements. The window is short and
 * exists on every page; more data or a loaded CI machine only widens it.
 *
 * `streamSettled` waits for it to close: the document has loaded and no hidden streamed copy is
 * left. `settleStreams()` (call it once at the top of a spec file) makes every `goto` in that
 * file wait for it, on every page the file opens. If a hidden copy outlives `STREAM_TIMEOUT_MS`,
 * the reveal never ran — a real app bug — and the wait fails saying so.
 */

const STREAM_TIMEOUT_MS = 10_000;
let maxWaitMs = 0;
let waits = 0;

/** Waits until the page has loaded and no hidden streamed Suspense copy (`div[hidden][id^="S:"]`) is left. */
export async function streamSettled(page: Page): Promise<number> {
  const started = Date.now();
  // A page without JavaScript (the skeleton capture) never runs the reveal: nothing to wait for.
  const scripted = await page
    .evaluate(() => typeof (window as unknown as { $RC?: unknown }).$RC === 'function' || !document.querySelector('div[hidden][id^="S:"]'))
    .catch(() => false);
  if (!scripted) return 0;
  try {
    await page.waitForFunction(
      () => document.readyState === 'complete' && !document.querySelector('div[hidden][id^="S:"]'),
      undefined,
      { timeout: STREAM_TIMEOUT_MS },
    );
  } catch (e) {
    const left = await page
      .evaluate(() => [...document.querySelectorAll('div[hidden][id^="S:"]')].map((d) => d.id))
      .catch(() => []);
    throw new Error(
      `stream never settled on ${page.url()} after ${STREAM_TIMEOUT_MS} ms — hidden streamed copies still in the page: ${left.join(', ') || 'none'} (${String(e)})`,
    );
  }
  const waited = Date.now() - started;
  waits += 1;
  maxWaitMs = Math.max(maxWaitMs, waited);
  return waited;
}

type Goto = Page['goto'];
const PATCHED = Symbol.for('school-erp.stream-settled');

/**
 * Every `page.goto` in this spec file (any page it opens) waits for `streamSettled` after the
 * navigation; the file's longest wait is logged at the end (`[stream-settled]`).
 */
export function settleStreams(): void {
  test.beforeEach(({ page }) => {
    const proto = Object.getPrototypeOf(page) as { goto: Goto; [PATCHED]?: boolean };
    if (proto[PATCHED]) return;
    const original = proto.goto;
    proto.goto = async function (this: Page, ...args: Parameters<Goto>) {
      const response = await original.apply(this, args);
      await streamSettled(this);
      return response;
    } as Goto;
    proto[PATCHED] = true;
  });
  test.afterAll(({ browserName }, info) => {
    void browserName;
    console.log(`[stream-settled] ${info.file.split('/').pop()}: ${waits} waits, longest ${maxWaitMs} ms`);
  });
}

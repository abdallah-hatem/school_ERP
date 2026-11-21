import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// On a machine that has ~/.config/school-erp/e2e-ci-only (the owner's, so also every Claude agent
// on it), smoke specs run on GitHub CI only (owner, 2026-11-21). Other developers run them locally.
if (process.env.GITHUB_ACTIONS !== 'true' && existsSync(join(homedir(), '.config/school-erp/e2e-ci-only'))) {
  throw new Error('On this machine smoke specs run on GitHub CI only (owner rule). Push and let CI run them.');
}


/*
 * Smoke specs (apps/web/e2e). Run them with `pnpm smoke` at the repo root: it creates its own
 * database, seeds it, starts the API and the web app, runs these specs and stops both servers.
 * The flows build on each other (a penalty recorded in 03 shows in the payroll of 05), so they run
 * in file order on one worker. Light theme only (CLAUDE.md), so no colour-scheme projects.
 */
/*
 * Desktop Chromium on Linux (CI) has classic scrollbars, and `scrollbar-gutter: stable` on <html>
 * reserves their 15px even when hidden; macOS's overlay scrollbars reserve nothing. Widen the Linux
 * desktop viewport by the gutter so the page gets the same 1440px of content as on a Mac — otherwise
 * container queries (table → cards, tile lines) land on the other side of their breakpoints.
 * Phone projects emulate a mobile device, which already has overlay scrollbars.
 */
const DESKTOP_WIDTH = 1440 + (process.platform === 'linux' ? 15 : 0);

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // CI also writes the HTML report, uploaded as an artifact when a run fails.
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4181',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: process.platform === 'linux' ? { args: ['--font-render-hinting=none'] } : undefined,
  },
  projects: [
    {
      name: 'desktop-en',
      testIgnore: /phone/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: DESKTOP_WIDTH, height: 900 },
        locale: 'en-US',
      },
    },
    {
      name: 'phone-ar',
      testMatch: /phone/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        locale: 'ar-EG',
      },
    },
  ],
});

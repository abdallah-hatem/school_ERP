import { defineConfig, devices } from '@playwright/test';

/*
 * Smoke specs (apps/web/e2e). Run them with `pnpm smoke` at the repo root: it creates its own
 * database, seeds it, starts the API and the web app, runs these specs and stops both servers.
 * The flows build on each other (a penalty recorded in 03 shows in the payroll of 05), so they run
 * in file order on one worker. Light theme only (CLAUDE.md), so no colour-scheme projects.
 */
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
    // Linux Chromium has classic scrollbars: `scrollbar-gutter: stable` on <html> then reserves 15px
    // even when they're hidden, so a 1440px desktop crosses table→cards breakpoints. Overlay
    // scrollbars reserve nothing — the macOS layout the specs were written against.
    launchOptions:
      process.platform === 'linux'
        ? { args: ['--font-render-hinting=none', '--enable-features=OverlayScrollbar'] }
        : undefined,
  },
  projects: [
    {
      name: 'desktop-en',
      testIgnore: /phone/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
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

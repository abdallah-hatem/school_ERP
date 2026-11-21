import { expect, test } from '@playwright/test';
import { t } from './support/i18n';
import { makeRoleUser, settled, signInAsRoleUser } from './support/role-access';
import { expectNoHorizontalScroll, settle, shoot, signIn } from './support/ui';

/**
 * Runs in the `desktop-en` project (1440×900). The home dashboard's charts (owner, 2026-11-21,
 * layout "A · Grid"): only the System admin holds `hr.dashboard.view_analytics` at the start. The
 * seeded admin (System admin + HR manager) sees the charts and the 6 / 12 months switch; a card's
 * Table toggle shows the same numbers as a table and back; the page never scrolls sideways, down to
 * 320px. A starting role without the key (the HR manager alone) sees today's dashboard: no charts,
 * no switch.
 */

test('the System admin sees the charts; Table shows the numbers; the range switch reloads them', async ({ page }, info) => {
  test.setTimeout(120_000);
  for (const locale of ['en', 'ar'] as const) {
    await signIn(page, locale);
    await page.goto(`/${locale}`);
    await settled(page);
    const charts = page.getByTestId('dashboard-charts');
    await expect(charts).toBeVisible();

    // Every card has a Table toggle; the first one swaps its chart for a table and back.
    const toggles = charts.getByRole('button', { name: t(locale, 'dashboard.charts.table') });
    expect(await toggles.count()).toBeGreaterThan(0);
    const card = charts.locator('section').filter({ has: toggles.first() }).first();
    await toggles.first().click();
    const table = card.getByRole('table');
    await expect(table).toBeVisible();
    expect(await table.locator('tbody tr').count()).toBeGreaterThan(0);
    await expect(card.getByRole('button', { name: t(locale, 'dashboard.charts.chart') })).toHaveAttribute('aria-pressed', 'true');
    await card.getByRole('button', { name: t(locale, 'dashboard.charts.chart') }).click();
    await expect(table).toHaveCount(0);

    // The range switch (shown once there are two approved months): 6 months reloads the charts in place.
    const range = page.getByRole('group', { name: t(locale, 'dashboard.charts.range.label') });
    if (await range.count()) {
      const six = range.getByRole('button', { name: t(locale, 'dashboard.charts.range.6') });
      await six.click();
      await expect(page).toHaveURL(/[?&]months=6/);
      await expect(six).toHaveAttribute('aria-pressed', 'true');
      await settled(page);
      await expect(charts).toBeVisible();
    }

    // A chart's tooltip shows on keyboard focus too.
    const chart = charts.getByRole('group').first();
    if (await chart.count()) {
      await chart.focus();
      await expect(page.getByRole('tooltip').first()).toBeVisible();
    }

    await settle(page);
    await shoot(page, info, `dashboard-charts-${locale}-desktop`);

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await settled(page);
      await expectNoHorizontalScroll(page);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().clearCookies();
  }
});

test('a role without hr.dashboard.view_analytics (the HR manager alone) sees no charts and no range switch', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const locale = 'en' as const;
  const user = await makeRoleUser('hr_manager');
  expect(user.keys).not.toContain('hr.dashboard.view_analytics');
  const page = await signInAsRoleUser(browser, user, locale, { width: 1440, height: 900 });
  await page.goto(`/${locale}`);
  await settled(page);
  // Today's dashboard: the tiles and quick links are there…
  await expect(page.getByRole('heading', { name: t(locale, 'dashboard.quickLinks.title') })).toBeVisible();
  // …and nothing of the charts.
  await expect(page.getByTestId('dashboard-charts')).toHaveCount(0);
  await expect(page.getByRole('group', { name: t(locale, 'dashboard.charts.range.label') })).toHaveCount(0);
  await expect(page.getByRole('button', { name: t(locale, 'dashboard.charts.table') })).toHaveCount(0);
  await shoot(page, info, 'dashboard-charts-hr-manager-desktop');
  await page.context().close();
});

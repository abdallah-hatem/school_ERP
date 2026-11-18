import { expect, test } from '@playwright/test';
import type { HrDashboard, SchoolSettings } from '@school-erp/shared';
import { Api } from './support/api';
import { literal, t } from './support/i18n';
import { shoot, signIn } from './support/ui';

test('a first visit with no language chosen opens in English (the default)', async ({ browser }) => {
  // A fresh context: no `lang` cookie. Arabic speakers switch with the EN/ع toggle.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/\/en(\/|$)/);
  await context.close();
});

test('sign in → the dashboard shows the headcount', async ({ page }, info) => {
  const api = await Api.asAdmin();
  const dashboard = await api.get<HrDashboard>('/hr/dashboard');
  const school = await api.get<SchoolSettings>('/settings/school');
  await api.dispose();

  await signIn(page, 'en');
  await expect(page).toHaveURL(/\/en\/?$/);
  // The tab names the school, like the sign-in page (dry run 2026-11-18).
  if (school.nameEn?.trim()) await expect(page).toHaveTitle(`${t('en', 'common.nav.dashboard')} · ${school.nameEn.trim()}`);

  const headcount = page.getByRole('link', {
    name: literal(t('en', 'dashboard.headcount.label')),
  });
  await expect(headcount).toBeVisible();
  await expect(headcount).toContainText(new Intl.NumberFormat('en-US').format(dashboard.headcount!.active));
  expect(dashboard.headcount!.active).toBeGreaterThan(0);
  await shoot(page, info, 'dashboard');
});

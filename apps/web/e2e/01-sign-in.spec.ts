import { expect, test } from '@playwright/test';
import type { HrDashboard } from '@school-erp/shared';
import { Api } from './support/api';
import { literal, t } from './support/i18n';
import { shoot, signIn } from './support/ui';

test('sign in → the dashboard shows the headcount', async ({ page }, info) => {
  const api = await Api.asAdmin();
  const dashboard = await api.get<HrDashboard>('/hr/dashboard');
  await api.dispose();

  await signIn(page, 'en');
  await expect(page).toHaveURL(/\/en\/?$/);

  const headcount = page.getByRole('link', {
    name: literal(t('en', 'dashboard.headcount.label')),
  });
  await expect(headcount).toBeVisible();
  await expect(headcount).toContainText(new Intl.NumberFormat('en-US').format(dashboard.headcount.active));
  expect(dashboard.headcount.active).toBeGreaterThan(0);
  await shoot(page, info, 'dashboard');
});

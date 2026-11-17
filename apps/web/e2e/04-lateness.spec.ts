import { expect, test, type Page } from '@playwright/test';
import { formatDays, latenessDays, type HrSettings, type LatenessMonth, type LatenessRow } from '@school-erp/shared';
import { Api } from './support/api';
import { currentMonth } from './support/dates';
import { t } from './support/i18n';
import { searchField, shoot, signIn } from './support/ui';

/*
 * Minutes chosen so a later grace change (05-payroll) moves the days: 75 → ¾ day and 130 → 1¼ days
 * with no grace, less with 30 grace minutes.
 */
const MINUTES = [75, 130];

async function findRow(page: Page, row: LatenessRow) {
  await searchField(page, t('en', 'lateness.search.label')).fill(row.employee.code);
  return page.getByRole('textbox', {
    name: t('en', 'lateness.minutesLabel', { name: row.employee.nameEn }),
    exact: true,
  });
}

test('lateness: minutes for two employees → days shown → saved → kept after a reload', async ({ page }, info) => {
  const month = currentMonth();
  const api = await Api.asAdmin();
  const [sheet, settings] = await Promise.all([
    api.get<LatenessMonth>('/hr/lateness', { month }),
    api.get<HrSettings>('/hr/settings'),
  ]);
  expect(sheet.locked).toBe(false);
  // Two employees whose minutes this month differ from the ones entered here.
  const rows = sheet.rows.filter((r) => !MINUTES.includes(r.minutes)).slice(0, 2);
  expect(rows).toHaveLength(2);
  const entries = rows.map((row, i) => ({ row, minutes: MINUTES[i] ?? 0 }));

  await signIn(page, 'en');
  await page.goto('/en/lateness');
  await expect(page.getByRole('heading', { level: 1, name: t('en', 'lateness.title') })).toBeVisible();

  for (const { row, minutes } of entries) {
    const input = await findRow(page, row);
    await input.fill(String(minutes));
    await expect(page.getByTestId(`days-${row.employee.id}`).filter({ visible: true })).toContainText(
      formatDays(latenessDays(minutes, settings.lateness)),
    );
  }
  await shoot(page, info, 'lateness');

  await page
    .getByRole('button', {
      name: t('en', 'lateness.saveCount', { count: entries.length }),
    })
    .click();
  await expect(page.getByText(t('en', 'lateness.saved'))).toBeVisible();

  await page.reload();
  for (const { row, minutes } of entries) {
    await expect(await findRow(page, row)).toHaveValue(String(minutes));
    await expect(page.getByTestId(`days-${row.employee.id}`).filter({ visible: true })).toContainText(
      formatDays(latenessDays(minutes, settings.lateness)),
    );
  }

  const saved = await api.get<LatenessMonth>('/hr/lateness', { month });
  for (const { row, minutes } of entries) {
    expect(saved.rows.find((r) => r.employee.id === row.employee.id)?.minutes).toBe(minutes);
  }
  await api.dispose();
});

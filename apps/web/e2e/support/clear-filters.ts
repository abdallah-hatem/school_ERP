import { expect, type Page, type TestInfo } from '@playwright/test';
import type { Language } from '@school-erp/shared';
import { t } from './i18n';
import { expectNoHorizontalScroll, expectTapTargets, searchField, shoot } from './ui';

/*
 * Every list with filters has "Clear filters · n" (owner, 2026-11-18): it appears once a search
 * or a filter is in use, counts them, and one click resets them all — the full list comes back
 * and the button goes. Shared by the desktop and phone specs.
 */

async function pick(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

export async function checkClearFilters(page: Page, info: TestInfo, locale: Language, suffix: string, phone: boolean): Promise<void> {
  const clearName = (count: number) => t(locale, 'ui.filters.clearCount', { count });

  // ── Employees: search + two filters → "Clear filters · 3" → everything back ──
  await page.goto(`/${locale}/employees`);
  const count = page.getByTestId('employees-count');
  await expect(count).toBeVisible();
  const fullCount = await count.textContent();
  await expect(page.getByRole('button', { name: /·/ }).filter({ hasText: t(locale, 'ui.filters.clear') })).toHaveCount(0);

  const search = searchField(page, t(locale, 'employees.list.searchLabel'));
  await search.fill('EMP');
  await expect(page).toHaveURL(/search=EMP/);
  await pick(page, t(locale, 'employees.columns.status'), t(locale, 'common.enums.employeeStatus.ACTIVE'));
  await expect(page).toHaveURL(/status=ACTIVE/);
  await pick(page, t(locale, 'employees.columns.workSystem'), t(locale, 'common.enums.workSystem.FULL_TIME'));
  await expect(page).toHaveURL(/workSystem=FULL_TIME/);

  const clear = page.getByRole('button', { name: clearName(3), exact: true }).first();
  await expect(clear).toBeVisible();
  await expect(clear).toBeInViewport();
  if (phone) {
    await expectTapTargets(clear);
    await expectNoHorizontalScroll(page);
  }
  await shoot(page, info, `clear-filters-employees-${suffix}`);

  await clear.click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/employees$`));
  await expect(search).toHaveValue('');
  await expect(count).toHaveText(fullCount ?? '');
  await expect(page.getByRole('button', { name: clearName(3), exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: t(locale, 'employees.columns.status'), exact: true })).toHaveText(
    t(locale, 'employees.list.allStatuses'),
  );

  // ── Penalties: a search with no match + a status → "No results" offers it too ──
  await page.goto(`/${locale}/penalties`);
  const penaltiesSearch = searchField(page, t(locale, 'penalties.filters.searchLabel'));
  await expect(penaltiesSearch).toBeEnabled();
  await pick(page, t(locale, 'penalties.filters.status'), t(locale, 'common.enums.penaltyStatus.APPROVED'));
  await expect(page).toHaveURL(/status=APPROVED/);
  await penaltiesSearch.fill('zzzz-no-such-person');
  await expect(page).toHaveURL(/search=zzzz/);
  await expect(page.getByText(t(locale, 'penalties.list.noResultsTitle'))).toBeVisible();
  const clears = page.getByRole('button', { name: clearName(2), exact: true });
  await expect(clears).toHaveCount(2); // the toolbar's and the "No results" one
  if (phone) await expectNoHorizontalScroll(page);
  await shoot(page, info, `clear-filters-penalties-${suffix}`);

  await clears.last().click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/penalties$`));
  await expect(penaltiesSearch).toHaveValue('');
  await expect(page.getByText(t(locale, 'penalties.list.noResultsTitle'))).toHaveCount(0);
  await expect(page.getByRole('button', { name: /·/ }).filter({ hasText: t(locale, 'ui.filters.clear') })).toHaveCount(0);
}

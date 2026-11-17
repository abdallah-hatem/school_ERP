import { expect, type Page, type TestInfo } from '@playwright/test';
import type { Language } from '@school-erp/shared';
import { prefixOf, t } from './i18n';
import { expectNoHorizontalScroll, settle, shoot } from './ui';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * T25: a picker with more than 6 options opens with its search focused (the work-time dropdown, 30
 * minute steps), and a table's row actions sit behind one ⋯ per row (the departments list). Shared
 * by the desktop and phone specs; screenshots of both open states.
 */
export async function checkPickersAndMenus(page: Page, info: TestInfo, locale: Language, tag: string) {
  // Searchable picker: work start time.
  await page.goto(`/${locale}/settings?section=school`);
  const workStart = page.getByRole('combobox', { name: new RegExp(escape(t(locale, 'settings.school.workStart'))) });
  await workStart.click();
  const search = page.getByRole('searchbox', { name: t(locale, 'ui.form.searchOptions') });
  await expect(search).toBeFocused();
  expect(await page.getByRole('option').count()).toBeGreaterThan(6);
  await settle(page);
  await expectNoHorizontalScroll(page);
  await shoot(page, info, `picker-open-${tag}`);
  await search.fill('zzz');
  await expect(page.getByText(t(locale, 'ui.form.noMatches'))).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();

  // Row menu: the first department.
  await page.goto(`/${locale}/settings?section=lists`);
  const more = page.getByRole('button', { name: new RegExp(`^${escape(prefixOf(locale, 'ui.table.actionsFor', {}))}`) }).first();
  await more.click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: t(locale, 'settings.lists.rename'), exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(2);
  await settle(page);
  await expectNoHorizontalScroll(page);
  await shoot(page, info, `row-menu-open-${tag}`);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
}

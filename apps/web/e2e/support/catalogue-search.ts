import { expect, type Page, type TestInfo } from '@playwright/test';
import type { Language, PenaltyGroup, Violation } from '@school-erp/shared';
import { Api } from './api';
import { prefixOf, t } from './i18n';
import { expectNoHorizontalScroll, settle, shoot } from './ui';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const nameIn = (locale: Language, item: { nameEn: string; nameAr: string }) =>
  locale === 'ar' ? item.nameAr : item.nameEn;

/** The seeded catalogue's groups and violations in use. */
export async function usableCatalogue(api: Api): Promise<{ group: PenaltyGroup; violation: Violation }[]> {
  const groups = await api.get<PenaltyGroup[]>('/hr/penalty-groups');
  return groups
    .filter((g) => g.isActive)
    .flatMap((group) => group.violations.filter((v) => v.isActive).map((violation) => ({ group, violation })));
}

/**
 * §7 (owner, 2026-11-18): Settings → Penalty catalogue's search. Searching a violation's own word
 * (in the screen's language, then in the other one) shows it, opens its group and hides violations
 * that don't match; a word nothing has gives "No violations match" with Clear filters.
 */
export async function checkCatalogueSearch(page: Page, info: TestInfo, locale: Language, tag: string) {
  const api = await Api.asAdmin();
  try {
    const all = await usableCatalogue(api);
    // A violation whose name has a word no violation of another group has.
    const words = (s: string) => s.split(/\s+/).filter((w) => w.length >= 4);
    const pick = all
      .flatMap(({ group, violation }) => words(nameIn(locale, violation)).map((word) => ({ group, violation, word })))
      .find(({ group, word }) =>
        all.every((o) => o.group.id === group.id || !nameIn(locale, o.violation).includes(word)),
      );
    if (!pick) throw new Error('smoke: no violation with a distinctive word to search for');
    const other = all.find((o) => o.group.id !== pick.group.id)!;

    await page.goto(`/${locale}/settings?section=catalogue`);
    const box = page.getByRole('searchbox', { name: t(locale, 'settings.catalogue.search'), exact: true });
    await expect(box).toBeEnabled();
    await box.fill(pick.word);
    await expect(page.getByText(nameIn(locale, pick.violation), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(nameIn(locale, other.violation), { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: new RegExp(`^${escape(nameIn(locale, pick.group))}`), expanded: true }),
    ).toBeVisible();
    await expect(page.locator('mark').first()).toBeVisible();
    await settle(page);
    await expectNoHorizontalScroll(page);
    await shoot(page, info, `catalogue-search-${tag}`);

    // The other language's name finds it too.
    const otherLocale: Language = locale === 'ar' ? 'en' : 'ar';
    await box.fill(nameIn(otherLocale, pick.violation));
    await expect(page.getByText(nameIn(locale, pick.violation), { exact: true }).first()).toBeVisible();

    // Nothing matches → the empty state; Clear filters brings the catalogue back.
    await box.fill('zzqqxx');
    await expect(page.getByText(t(locale, 'settings.catalogue.noMatchesTitle'))).toBeVisible();
    await shoot(page, info, `catalogue-search-empty-${tag}`);
    await page.getByRole('button', { name: prefixOf(locale, 'ui.filters.clearCount', {}) }).last().click();
    await expect(box).toHaveValue('');
    await expect(page.getByRole('button', { name: new RegExp(`^${escape(nameIn(locale, other.group))}`) })).toBeVisible();
  } finally {
    await api.dispose();
  }
}

/** The violation dialog's "Once per day" switch, on a violation that can repeat in a day (screenshot only). */
export async function showOncePerDaySwitch(page: Page, info: TestInfo, locale: Language, tag: string) {
  const api = await Api.asAdmin();
  try {
    const repeating = (await usableCatalogue(api)).find(({ violation }) => !violation.oncePerDay);
    if (!repeating) throw new Error('smoke: the seed has no violation that repeats in a day');
    const name = nameIn(locale, repeating.violation);
    await page.goto(`/${locale}/settings?section=catalogue`);
    await page.getByRole('searchbox', { name: t(locale, 'settings.catalogue.search'), exact: true }).fill(name);
    const row = page.getByRole('listitem').filter({ hasText: name }).last();
    await expect(row.getByText(t(locale, 'settings.catalogue.repeatsInDay'))).toBeVisible();
    await row.getByRole('button', { name: t(locale, 'ui.table.actionsFor', { name }) }).click();
    await page.getByRole('menuitem', { name: t(locale, 'common.actions.edit'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t(locale, 'settings.catalogue.editViolationTitle') });
    const toggle = dialog.getByRole('switch', { name: t(locale, 'settings.catalogue.oncePerDay') });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.scrollIntoViewIfNeeded();
    await settle(page);
    await shoot(page, info, `once-per-day-switch-${tag}`);
    await dialog.getByRole('button', { name: t(locale, 'common.actions.cancel'), exact: true }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await api.dispose();
  }
}

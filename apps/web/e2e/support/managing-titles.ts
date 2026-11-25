import { join } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { EmployeeSummary, JobTitle, Language } from '@school-erp/shared';
import { Api } from './api';
import { prefixOf, t } from './i18n';
import { expectNoHorizontalScroll, settle, shoot } from './ui';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameIn = (locale: Language, item: { nameEn: string; nameAr: string }) =>
  locale === 'ar' ? item.nameAr : item.nameEn;

/**
 * §3 direct managers (2026-11-18): turn "Manages people" on for a job title in Settings → HR
 * lists, then the employee form's Direct manager picker lists an employee with that title, while
 * an employee whose title doesn't manage people is absent. Then the title is turned off again and
 * an employee who already reports to that person keeps them, with the "No longer in a managing
 * role" note. Setup and clean-up go through the API; the checks through the screens.
 */
export async function checkManagingTitles(page: Page, info: TestInfo, locale: Language, tag: string) {
  const api = await Api.asAdmin();
  try {
    const titles = await api.get<JobTitle[]>('/hr/job-titles');
    const managingIds = new Set(titles.filter((jt) => jt.managesPeople).map((jt) => jt.id));
    const active = await api.get<EmployeeSummary[]>('/hr/employees', { status: 'ACTIVE', limit: 100 });
    // A title nobody manages with yet, held by at least two active employees.
    const held = (id: string) => active.filter((e) => e.jobTitle.id === id);
    const title = titles.find((jt) => !jt.managesPeople && jt.isActive && held(jt.id).length >= 2);
    const outsider = active.find((e) => !managingIds.has(e.jobTitle.id) && e.jobTitle.id !== title?.id);
    if (!title || !outsider) throw new Error('smoke: the seed has no non-managing title to switch on');
    const [holder, report] = held(title.id) as [EmployeeSummary, EmployeeSummary];
    // A clean start, whatever an earlier run left.
    await api.patch(`/hr/job-titles/${title.id}`, { managesPeople: false });

    // ── Settings: switch it on through the Edit dialog; the badge appears.
    await page.goto(`/${locale}/settings?section=lists`);
    const rowName = nameIn(locale, title);
    const more = page.getByRole('button', {
      name: new RegExp(`^${escape(prefixOf(locale, 'ui.table.actionsFor', {}))}${escape(rowName)}$`),
    });
    await more.first().click();
    await page.getByRole('menuitem', { name: t(locale, 'settings.lists.jobTitles.edit'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t(locale, 'settings.lists.jobTitles.editItem', { name: rowName }) });
    const toggle = dialog.getByRole('switch', { name: t(locale, 'settings.lists.jobTitles.managesPeople') });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await settle(page);
    await expectNoHorizontalScroll(page);
    await shoot(page, info, `managing-switch-${tag}`);
    await dialog.getByRole('button', { name: t(locale, 'common.actions.save'), exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(t(locale, 'settings.lists.jobTitles.managesPeople')).filter({ visible: true }).first()).toBeVisible();
    await expect.poll(async () => (await api.get<JobTitle[]>('/hr/job-titles')).find((jt) => jt.id === title.id)?.managesPeople).toBe(true);
    await settle(page);
    await shoot(page, info, `managing-badge-${tag}`);

    // ── New employee: the picker lists the holder, not the outsider; search works by name and code.
    // An option reads "Name · Department" (owner, 2026-11-25): the department is the option's lighter
    // hint, and the separator is plain text, so the accessible name stays "Name · Department".
    const label = (e: EmployeeSummary) => `${nameIn(locale, e)} · ${nameIn(locale, e.department)}`;
    const option = (e: EmployeeSummary) => page.getByRole('option', { name: label(e), exact: true });
    await page.goto(`/${locale}/employees/new`);
    const picker = page.getByRole('combobox', { name: new RegExp(escape(t(locale, 'employees.fields.manager'))) });
    await picker.click();
    const search = page.getByRole('searchbox', { name: t(locale, 'ui.form.searchOptions') });
    await expect(search).toBeFocused();
    await expect(page.getByRole('option', { name: t(locale, 'employees.noManager') })).toBeVisible();
    await expect(option(holder).first()).toBeVisible();
    await expect(option(outsider)).toHaveCount(0);
    await settle(page);
    await expectNoHorizontalScroll(page);
    await shoot(page, info, `manager-picker-${tag}`);
    await search.fill(nameIn(locale, holder));
    await expect(option(holder).first()).toBeVisible();
    await search.fill(holder.code);
    await expect(option(holder)).toHaveCount(1);
    await search.fill(outsider.code);
    await expect(page.getByText(t(locale, 'ui.form.noMatches'))).toBeVisible();
    await page.keyboard.press('Escape');

    // ── Kept but flagged: `report` reports to `holder`; the title stops managing people.
    await api.patch(`/hr/employees/${report.id}`, { managerId: holder.id });
    await api.patch(`/hr/job-titles/${title.id}`, { managesPeople: false });
    await page.goto(`/${locale}/employees/${report.id}/edit`);
    const kept = page.getByRole('combobox', { name: new RegExp(escape(t(locale, 'employees.fields.manager'))) });
    await expect(kept).toContainText(label(holder));
    const note = page.getByText(t(locale, 'employees.hints.managerNotManaging'));
    await expect(note).toBeVisible();
    await note.scrollIntoViewIfNeeded();
    await settle(page);
    await page.screenshot({ path: shotPath(info, `manager-kept-${tag}`) });
    await api.patch(`/hr/employees/${report.id}`, { managerId: null });
  } finally {
    await api.dispose();
  }
}

/** Viewport (not full page): the note sits mid-form. */
function shotPath(info: TestInfo, name: string): string {
  return join(__dirname, '..', 'screenshots', info.project.name, `${name}.png`);
}

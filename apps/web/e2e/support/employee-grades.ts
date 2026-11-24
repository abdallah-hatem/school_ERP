import { join } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { Employee, Language } from '@school-erp/shared';
import { smokeGrade } from './activity';
import { Api } from './api';
import { prefixOf, t } from './i18n';
import { activeEmployee } from './profile-tabs';
import { expectNoHorizontalScroll, settle, shoot } from './ui';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * §3 (owner, 2026-11-24): an employee's grade is picked from the school's Grades list. Settings →
 * HR lists shows the Grades panel beside departments and job titles (add, rename, hide); the
 * employee form's Grade picker is searched by the API, offers "No grade", and keeps an employee's
 * own grade after it was hidden, with the hidden note; the employee's page shows the grade's name
 * in the page's language. The smoke grade is a stable one (`smokeGrade`), renamed and put back, so
 * runs don't pile grades up; set-up and clean-up go through the API.
 */
export async function checkGrades(page: Page, info: TestInfo, locale: Language, tag: string): Promise<void> {
  const grade = await smokeGrade(locale);
  const employee: Employee = await activeEmployee();
  const api = await Api.asAdmin();
  try {
    // ── Settings → HR lists: the Grades panel, its Add dialog, and a rename through the row menu.
    await page.goto(`/${locale}/settings?section=lists`);
    await expect(page.getByRole('heading', { name: t(locale, 'settings.lists.employeeGrades.title'), exact: true })).toBeVisible();
    await expect(page.getByText(grade.name, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await page.getByRole('button', { name: t(locale, 'settings.lists.employeeGrades.add'), exact: true }).click();
    const add = page.getByRole('dialog', { name: t(locale, 'settings.lists.employeeGrades.add') });
    await expect(add.getByLabel(t(locale, 'settings.names.nameEn'))).toBeVisible();
    await settle(page);
    await expectNoHorizontalScroll(page);
    await shoot(page, info, `grades-add-${tag}`);
    await add.getByRole('button', { name: t(locale, 'common.actions.cancel'), exact: true }).click();
    await expect(add).toBeHidden();

    const renamed = `${grade.name} renamed`;
    await page
      .getByRole('button', { name: new RegExp(`^${escape(prefixOf(locale, 'ui.table.actionsFor', {}))}${escape(grade.name)}$`) })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByRole('menuitem', { name: t(locale, 'settings.lists.rename'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t(locale, 'settings.lists.renameItem', { name: grade.name }) });
    await dialog.getByLabel(t(locale, 'settings.names.nameEn')).fill(renamed);
    await dialog.getByLabel(t(locale, 'settings.names.nameAr')).fill(renamed);
    await dialog.getByRole('button', { name: t(locale, 'common.actions.save'), exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(renamed, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await settle(page);
    await expectNoHorizontalScroll(page);
    await shoot(page, info, `grades-${tag}`);
    await api.patch(`/hr/employee-grades/${grade.id}`, { nameEn: grade.name, nameAr: grade.name });

    // ── New employee: the picker offers "No grade" and the shown grades; the API searches them.
    await page.goto(`/${locale}/employees/new`);
    const picker = page.getByRole('combobox', { name: new RegExp(escape(t(locale, 'employees.fields.grade'))) });
    await expect(picker).toContainText(t(locale, 'employees.noGrade'));
    await picker.click();
    const search = page.getByRole('searchbox', { name: t(locale, 'ui.form.searchOptions') });
    await expect(search).toBeFocused();
    await expect(page.getByRole('option', { name: t(locale, 'employees.noGrade') })).toBeVisible();
    await settle(page);
    await expectNoHorizontalScroll(page);
    // A viewport shot, not a full-page one: a full-page capture resizes the viewport to the page's
    // height and back, which scrolls the page away from the open (fixed-position) picker — nothing a
    // person can do, and Playwright can't scroll a fixed element back into view.
    await page.screenshot({ path: join(__dirname, '..', 'screenshots', info.project.name, `grade-picker-${tag}.png`) });
    await search.fill(grade.name);
    const option = page.getByRole('option', { name: grade.name, exact: true });
    // Reachable where a person taps it, on a phone too.
    await expect(option).toBeInViewport();
    await option.click();
    await expect(picker).toContainText(grade.name);

    // ── Kept but flagged: the employee's grade is hidden; their edit form still shows it, noted.
    await api.patch(`/hr/employees/${employee.id}`, { employeeGradeId: grade.id });
    await api.patch(`/hr/employee-grades/${grade.id}`, { isActive: false });
    await page.goto(`/${locale}/employees/${employee.id}/edit`);
    const kept = page.getByRole('combobox', { name: new RegExp(escape(t(locale, 'employees.fields.grade'))) });
    await expect(kept).toContainText(grade.name);
    await expect(page.getByText(t(locale, 'employees.hints.hiddenItem')).filter({ visible: true }).first()).toBeVisible();
    // The employee's page shows the grade by its name.
    await page.goto(`/${locale}/employees/${employee.id}`);
    await expect(page.getByText(grade.name, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  } finally {
    await api.patch(`/hr/employee-grades/${grade.id}`, { nameEn: grade.name, nameAr: grade.name });
    await api.patch(`/hr/employees/${employee.id}`, { employeeGradeId: employee.employeeGrade?.id ?? null });
    // Hidden again: the smoke grade is shown only while a run uses it (dev pickers stay clean).
    await api.patch(`/hr/employee-grades/${grade.id}`, { isActive: false });
    await api.dispose();
  }
}

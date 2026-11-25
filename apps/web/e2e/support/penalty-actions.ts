import { expect, type Page, type TestInfo } from '@playwright/test';
import type { Language, PenaltyActionItem, PenaltyGroup, Violation } from '@school-erp/shared';
import { Api } from './api';
import { prefixOf, t } from './i18n';
import { expectNoHorizontalScroll, settle, shoot } from './ui';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameIn = (locale: Language, item: { nameEn: string; nameAr: string }) => (locale === 'ar' ? item.nameAr : item.nameEn);

/** The stable smoke action (names are unique and actions never deleted: reused, hidden after a run). */
const SMOKE_ACTION = { nameEn: 'Smoke salary deduction %', nameAr: 'خصم نسبة تجريبي' };
/** The stable smoke violation whose level 1 the run sets to the smoke action, then puts back. */
const SMOKE_VIOLATION = { nameEn: 'Smoke penalty actions check', nameAr: 'فحص إجراءات الجزاءات' };
const WARNING_ID = '5eed0000-0000-4000-8000-000000000002';

async function findAction(api: Api): Promise<PenaltyActionItem | undefined> {
  const page = await api.get<PenaltyActionItem[]>('/hr/penalty-actions', { includeHidden: 'true', search: SMOKE_ACTION.nameEn, limit: '20' });
  return page.find((a) => a.nameEn === SMOKE_ACTION.nameEn);
}

async function smokeViolation(api: Api): Promise<Violation> {
  const groups = await api.get<PenaltyGroup[]>('/hr/penalty-groups');
  const found = groups.flatMap((g) => g.violations.map((v) => ({ g, v }))).find(({ v }) => v.nameEn === SMOKE_VIOLATION.nameEn);
  if (found) {
    return api.patch<Violation>(`/hr/violations/${found.v.id}`, { isActive: true, levels: [{ level: 1, actionId: WARNING_ID }] });
  }
  const group = groups.find((g) => g.isActive)!;
  return api.post<Violation>(`/hr/penalty-groups/${group.id}/violations`, {
    ...SMOKE_VIOLATION,
    levels: [{ level: 1, actionId: WARNING_ID }],
  });
}

/**
 * Spec 2026-11-25: Settings → Penalty catalogue → Penalty actions. The card lists the actions with
 * their effect; Add action asks for the names, one of five effects and — for a % — which salary;
 * the smoke action (a % of the salary for the month) is added there on the first run, reused after.
 * Then a violation's level picks it: the number field becomes a percent with its salary hint, and the
 * saved level reads "Deduct 10% of the salary for the month". Clean-up through the API.
 */
export async function checkPenaltyActions(page: Page, info: TestInfo, locale: Language, tag: string): Promise<void> {
  const api = await Api.asAdmin();
  let action = await findAction(api);
  const violation = await smokeViolation(api);
  try {
    if (action && !action.isActive) await api.patch(`/hr/penalty-actions/${action.id}`, { isActive: true });
    await page.goto(`/${locale}/settings?section=catalogue&part=actions`);
    await expect(page.getByRole('heading', { name: t(locale, 'settings.penaltyActions.title'), exact: true })).toBeVisible();
    await expect(page.getByText(nameIn(locale, { nameEn: 'Warning', nameAr: 'إنذار' }), { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await settle(page);
    await expectNoHorizontalScroll(page);
    await shoot(page, info, `penalty-actions-${tag}`);

    // ── Add action: names, the effect (five choices), the salary of a %.
    await page.getByRole('button', { name: t(locale, 'settings.penaltyActions.add'), exact: true }).click();
    const add = page.getByRole('dialog', { name: t(locale, 'settings.penaltyActions.addTitle') });
    await expect(add.getByRole('radio')).toHaveCount(5);
    await add.getByLabel(t(locale, 'settings.names.nameEn')).fill(SMOKE_ACTION.nameEn);
    await add.getByLabel(t(locale, 'settings.names.nameAr')).fill(SMOKE_ACTION.nameAr);
    await add.getByRole('radio', { name: t(locale, 'settings.penaltyActions.effectHelp.DEDUCT_PERCENT') }).click();
    await expect(add.getByRole('radio', { name: t(locale, 'settings.penaltyActions.base.MONTH_SALARY') })).toHaveAttribute('aria-checked', 'true');
    await settle(page);
    await expectNoHorizontalScroll(page);
    await shoot(page, info, `penalty-action-add-${tag}`);
    if (action) {
      await add.getByRole('button', { name: t(locale, 'common.actions.cancel'), exact: true }).click();
    } else {
      await add.getByRole('button', { name: t(locale, 'common.actions.create'), exact: true }).click();
      await expect(add).toBeHidden();
      action = await findAction(api);
      expect(action?.effect).toBe('DEDUCT_PERCENT');
      expect(action?.percentBase).toBe('MONTH_SALARY');
    }
    await expect(add).toBeHidden();

    // ── A level picks it: the number becomes a percent of the salary for the month.
    const search = page.getByRole('searchbox', { name: t(locale, 'settings.catalogue.search'), exact: true });
    await search.fill(nameIn(locale, SMOKE_VIOLATION));
    const name = nameIn(locale, SMOKE_VIOLATION);
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await page
      .getByRole('button', { name: new RegExp(`^${escape(prefixOf(locale, 'ui.table.actionsFor', {}))}${escape(name)}$`) })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByRole('menuitem', { name: t(locale, 'common.actions.edit'), exact: true }).click();
    const editor = page.getByRole('dialog', { name: t(locale, 'settings.catalogue.editViolationTitle') });
    await editor.getByRole('combobox', { name: new RegExp(escape(t(locale, 'settings.catalogue.levelAction', { level: 1 }))) }).click();
    await page.getByRole('option', { name: nameIn(locale, SMOKE_ACTION), exact: true }).click();
    const percent = editor.getByRole('textbox', { name: new RegExp(escape(t(locale, 'settings.catalogue.levelPercent', { level: 1 }))) });
    await expect(percent).toBeVisible();
    await expect(editor.getByText(t(locale, 'settings.catalogue.percentOfMonth'))).toBeVisible();
    await percent.fill('10');
    await settle(page);
    await expectNoHorizontalScroll(page);
    await shoot(page, info, `penalty-level-percent-${tag}`);
    await editor.getByRole('button', { name: t(locale, 'common.actions.save'), exact: true }).click();
    await expect(editor).toBeHidden();
    const label = t(locale, 'settings.catalogue.levelPlain', {
      level: 1,
      action: t(locale, 'penalties.action.percentMonth', { percent: '10' }),
    });
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  } finally {
    await api.patch(`/hr/violations/${violation.id}`, { isActive: false, levels: [{ level: 1, actionId: WARNING_ID }] });
    if (action) await api.patch(`/hr/penalty-actions/${action.id}`, { isActive: false });
    await api.dispose();
  }
}

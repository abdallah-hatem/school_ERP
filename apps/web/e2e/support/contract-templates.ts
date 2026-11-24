import { expect, type Page, type TestInfo } from '@playwright/test';
import type { Contract, ContractCopy, ContractTemplateSummary, Language } from '@school-erp/shared';
import { Api } from './api';
import { createContractEmployee } from './contracts';
import { t } from './i18n';
import { shoot } from './ui';

/*
 * Contract templates (spec 2026-11-24-contract-templates), end to end: the seed's template is
 * listed in Settings and opens in the editor, where a field chip goes in from the Fields panel;
 * a new full-time employee's contract prints from its Contracts tab with that template (the
 * work system's default, preselected), filled, paginated "Page 1 of N"; Download PDF / "Print or
 * PDF" keeps a copy, listed on the contract, whose PDF has as many pages as the preview
 * (edge case 26). Data only through the API.
 */

const SEED_TEMPLATE = { en: 'Full-time contract', ar: 'عقد عمل بدوام كامل' } as const;

export async function checkContractTemplates(page: Page, info: TestInfo, locale: Language, shotPrefix: string): Promise<void> {
  const phone = shotPrefix.startsWith('phone');
  const api = await Api.asAdmin();
  const templates = await api.get<ContractTemplateSummary[]>('/hr/contract-templates', { search: SEED_TEMPLATE.en, limit: 10 });
  const seed = templates.find((tpl) => tpl.nameEn === SEED_TEMPLATE.en);
  if (!seed) throw new Error('smoke: the seed has no "Full-time contract" template');
  const employee = await createContractEmployee(api);
  const contracts = await api.get<Contract[]>(`/hr/employees/${employee.id}/contracts`, { limit: 10 });
  const contract = contracts[0];
  if (!contract) throw new Error('smoke: the new employee has no contract');
  const main = page.locator('main');
  const templateName = SEED_TEMPLATE[locale];

  try {
    // Settings → Contract templates: the seed template, server-listed.
    await page.goto(`/${locale}/settings?section=contractTemplates`);
    const list = main.getByRole('region', { name: t(locale, 'contract-templates.list.tableLabel') });
    await expect(list.getByText(templateName, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(list.getByText(t(locale, 'contract-templates.list.defaultFor', { workSystem: t(locale, 'common.enums.workSystem.FULL_TIME') })).filter({ visible: true }).first()).toBeVisible();
    await shoot(page, info, `${shotPrefix}-contract-templates`);

    // The editor: its heading, the toolbar, and a field chip inserted from the Fields panel.
    await page.goto(`/${locale}/settings/contract-templates/${seed.id}`);
    await expect(main.getByRole('heading', { level: 1, name: templateName })).toBeVisible();
    const canvas = main.getByRole('textbox', { name: t(locale, 'contract-templates.editor.canvasLabel', { language: t(locale, 'contract-templates.languages.AR') }) });
    await expect(canvas).toBeVisible();
    const chips = canvas.locator('[data-field="employee.nationalId"]');
    const before = await chips.count();
    await canvas.click();
    await page.keyboard.press('ControlOrMeta+End');
    const insert = t(locale, 'contract-templates.editor.fields.insert', { name: t(locale, 'contract-templates.fields.employee.nationalId') });
    if (phone) {
      await main.getByRole('button', { name: t(locale, 'contract-templates.editor.fields.button'), exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: insert }).click();
    } else {
      await main.getByRole('button', { name: insert }).click();
    }
    await expect(chips).toHaveCount(before + 1);
    // Unsaved: the phone's sticky bar says so.
    if (phone) await expect(page.getByText(t(locale, 'contract-templates.editor.unsavedBar'))).toBeVisible();
    await shoot(page, info, `${shotPrefix}-contract-template-editor`);

    // Print the new employee's contract from its Contracts tab. Leaving the editor asks first
    // (the browser's own prompt): leave without saving.
    page.once('dialog', (d) => void d.accept());
    await page.goto(`/${locale}/employees/${employee.id}/contracts`);
    await main
      .getByRole('button', { name: t(locale, 'contract-templates.print.button'), exact: true })
      .filter({ visible: true })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: t(locale, 'contract-templates.print.title') });
    await expect(dialog).toBeVisible();
    // The work system's default is preselected, and the pages are filled and paginated.
    await expect(dialog.getByRole('combobox', { name: t(locale, 'contract-templates.print.template') })).toContainText(templateName);
    const sheets = dialog.locator('[data-a4-page]');
    await expect(sheets.first()).toBeVisible();
    await expect(sheets.first().locator('.cd-field').first()).toBeVisible();
    const pageCount = await sheets.count();
    await expect(dialog.getByText(new RegExp(t(locale, 'contract-templates.print.page', { page: 1, count: pageCount })))).toBeVisible();
    await shoot(page, info, `${shotPrefix}-print-contract`);

    if (phone) {
      // No file sharing in the test browser: the PDF opens in the browser's viewer (edge case 18).
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
      });
      const popup = page.waitForEvent('popup');
      await dialog.getByRole('button', { name: t(locale, 'contract-templates.print.printOrPdf') }).click();
      await (await popup).close();
    } else {
      const download = page.waitForEvent('download');
      await dialog.getByRole('button', { name: t(locale, 'contract-templates.print.download') }).click();
      expect((await download).suggestedFilename()).toMatch(new RegExp(`^${employee.code}-.*\\.pdf$`));
    }

    // The copy is kept on the contract, and its PDF has the preview's page count (edge case 26).
    await expect
      .poll(async () => (await api.get<ContractCopy[]>(`/hr/contracts/${contract.id}/copies`, { limit: 10 })).length, { timeout: 30_000 })
      .toBe(1);
    const [copy] = await api.get<ContractCopy[]>(`/hr/contracts/${contract.id}/copies`, { limit: 10 });
    expect(copy!.pageCount).toBe(pageCount);
    await page.keyboard.press('Escape');
    await page.goto(`/${locale}/employees/${employee.id}/contracts`);
    const copies = main.getByTestId('contract-copies').filter({ visible: true }).first();
    await expect(copies).toContainText(templateName);
    await expect(copies.locator('a[href^="/files/contract-copies/"]').first()).toBeVisible();
    await shoot(page, info, `${shotPrefix}-contract-copies`);
  } finally {
    await api.dispose();
  }
}

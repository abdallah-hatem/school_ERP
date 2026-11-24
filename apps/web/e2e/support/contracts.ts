import { expect, type Page, type TestInfo } from '@playwright/test';
import {
  contractYearOf,
  formatContractYear,
  type Employee,
  type Language,
  type ListItem,
  type Stage,
} from '@school-erp/shared';
import { Api } from './api';
import { todayIso } from './dates';
import { t } from './i18n';
import { shoot } from './ui';

/*
 * Contracts (spec 2026-11-24), end to end: an employee created through the API gets its first
 * contract (the current contract year), shows on the renewals screen as "Not decided", is renewed
 * from its row, and its Contracts tab lists both contracts. Data only through the API.
 */

/** A new active employee (its first contract: 1 June – 31 May of the current contract year). */
export async function createContractEmployee(api: Api): Promise<Employee> {
  const stamp = `${Date.now()}`.slice(-7);
  const [stages, departments, jobTitles] = await Promise.all([
    api.get<Stage[]>('/stages', { limit: 100 }),
    api.get<ListItem[]>('/hr/departments', { limit: 100 }),
    api.get<ListItem[]>('/hr/job-titles', { limit: 100 }),
  ]);
  const stage = stages.find((s) => !s.isNoStage) ?? stages[0];
  const department = departments.find((d) => d.isActive) ?? departments[0];
  const jobTitle = jobTitles.find((j) => j.isActive) ?? jobTitles[0];
  if (!stage || !department || !jobTitle) throw new Error('smoke: the seed has no stage, department or job title');
  return api.post<Employee>('/hr/employees', {
    nameEn: `Smoke Contract ${stamp}`,
    nameAr: `عقد تجريبي ${stamp}`,
    gender: 'FEMALE',
    dateOfBirth: '1990-04-12',
    phone: `010${stamp.padStart(8, '0')}`,
    hireDate: todayIso(),
    stageId: stage.id,
    departmentId: department.id,
    jobTitleId: jobTitle.id,
    workSystem: 'FULL_TIME',
    basicSalary: 900_000,
  });
}

/** The whole check, in `locale`, on the page's viewport (desktop table or phone cards). */
export async function checkContracts(page: Page, info: TestInfo, locale: Language, shotPrefix: string): Promise<void> {
  const api = await Api.asAdmin();
  const employee = await createContractEmployee(api);
  await api.dispose();
  const name = locale === 'ar' ? employee.nameAr : employee.nameEn;
  const year = contractYearOf(employee.contractStart);
  const main = page.locator('main');

  // The renewals screen: the tiles, and the new contract found by its code, not decided yet.
  await page.goto(`/${locale}/contracts?year=${year}&search=${encodeURIComponent(employee.code)}`);
  await expect(main.getByRole('heading', { level: 1, name: t(locale, 'contracts.title') })).toBeVisible();
  const tiles = main.getByRole('region', { name: t(locale, 'contracts.tiles.label') });
  await expect(tiles.getByRole('button')).toHaveCount(5);
  await expect(main.getByRole('group', { name: t(locale, 'contracts.year.label') })).toContainText(formatContractYear(year));
  const list = main.getByRole('region', { name: t(locale, 'contracts.list.tableLabel', { year: formatContractYear(year) }) });
  await expect(list.getByText(name).first()).toBeVisible();
  await expect(list.getByText(t(locale, 'common.enums.contractDecision.UNDECIDED')).first()).toBeVisible();
  await shoot(page, info, `${shotPrefix}-contracts-renewals`);

  // Renew it from its row (the table row on a desktop, the card on a phone): asked first.
  await list.getByRole('button', { name: t(locale, 'contracts.actions.renew'), exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: t(locale, 'contracts.renew.title') });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: t(locale, 'contracts.renew.confirm'), exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(list.getByText(t(locale, 'common.enums.contractDecision.RENEWED')).first()).toBeVisible();
  await expect(list.getByRole('button', { name: t(locale, 'contracts.actions.renew'), exact: true })).toHaveCount(0);
  await shoot(page, info, `${shotPrefix}-contracts-renewed`);

  // The employee's Contracts tab: both contracts, newest first, the old one renewed.
  await page.goto(`/${locale}/employees/${employee.id}/contracts`);
  await expect(main.getByRole('link', { name: t(locale, 'common.nav.contracts') })).toHaveAttribute('aria-current', 'page');
  const history = main.getByRole('region', { name: t(locale, 'contracts.history.tableLabel', { name }) });
  await expect(history.getByText(formatContractYear(year + 1)).first()).toBeVisible();
  await expect(history.getByText(formatContractYear(year)).first()).toBeVisible();
  await expect(history.getByText(t(locale, 'common.enums.contractDecision.RENEWED')).first()).toBeVisible();
  await shoot(page, info, `${shotPrefix}-employee-contracts`);
}

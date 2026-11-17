import { expect, type Page, type TestInfo } from '@playwright/test';
import { EmployeeStatus, type Employee, type EmployeeSummary, type Language } from '@school-erp/shared';
import { Api } from './api';
import { t } from './i18n';
import { expectNoHorizontalScroll, searchField, shoot } from './ui';

/*
 * §3 (owner, 2026-11-18): edit an employee's social insurance and bank details through the form and
 * see them on the profile; the seeded portrait shows on its employee's card and profile, and an
 * employee without a photo shows the silhouette. Used by 21-employee-details*.
 */

const IBAN = 'EG380019000500000000263180002';

/** The seeded employee with a photo, and an active one without (a different one per run tag). */
async function pickEmployees(api: Api, offset: number) {
  const all = await api.get<EmployeeSummary[]>('/hr/employees', { status: EmployeeStatus.ACTIVE, limit: 100 });
  const withPhoto = all.find((e) => e.photoUrl);
  const without = all.filter((e) => !e.photoUrl);
  const target = without[offset % without.length];
  if (!withPhoto || !target) throw new Error('smoke: the seed needs one employee with a photo and others without');
  return { withPhoto, target };
}

const avatarOf = (page: Page, articleName: string) =>
  page.getByRole('article', { name: articleName, exact: true }).locator('[data-avatar]');

export async function checkEmployeeDetails(page: Page, info: TestInfo, locale: Language, tag: string, offset: number) {
  const api = await Api.asAdmin();
  const { withPhoto, target } = await pickEmployees(api, offset);
  const insuranceNumber = String(Date.now()).slice(-9);
  const name = (e: EmployeeSummary) => (locale === 'ar' ? e.nameAr : e.nameEn);

  // ── Edit insurance + bank details ───────────────────────────────────────────
  await page.goto(`/${locale}/employees/${target.id}/edit`);
  const number = page.getByRole('textbox', { name: t(locale, 'employees.fields.insuranceNumber') });
  await expect(number).toBeHidden();
  await page.getByRole('combobox', { name: t(locale, 'employees.fields.insuranceStatus') }).click();
  await page.getByRole('option', { name: t(locale, 'common.enums.insuranceStatus.INSURED'), exact: true }).click();
  await number.fill(insuranceNumber);

  await page.getByRole('button', { name: new RegExp(t(locale, 'employees.fields.insuranceRegistrationDate')) }).click();
  const picker = page.getByRole('dialog');
  await picker.getByRole('grid').getByText('1', { exact: true }).first().click();
  await expect(picker).toBeHidden();

  const salary = page.getByRole('textbox', { name: t(locale, 'employees.fields.insuredSalary') });
  await salary.pressSequentially('9500');
  // Grouped live while typing (MoneyField).
  await expect(salary).toHaveValue('9,500');

  await page.getByRole('textbox', { name: t(locale, 'employees.fields.bankName') }).fill('National Bank of Egypt');
  await page.getByRole('textbox', { name: t(locale, 'employees.fields.iban') }).fill(IBAN);
  await expectNoHorizontalScroll(page);
  await shoot(page, info, `employee-details-form-${tag}`);
  await page.getByRole('button', { name: t(locale, 'employees.edit.submit') }).click();

  // ── The profile shows them ──────────────────────────────────────────────────
  await expect(page).toHaveURL(new RegExp(`/${locale}/employees/${target.id}$`));
  await expect(page.getByText(insuranceNumber, { exact: true })).toBeVisible();
  await expect(page.getByText(IBAN, { exact: true })).toBeVisible();
  await expect(page.getByText('National Bank of Egypt', { exact: true })).toBeVisible();
  await expect(page.getByText(t(locale, 'common.enums.insuranceStatus.INSURED'), { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shoot(page, info, `employee-details-profile-${tag}`);
  const saved = await api.get<Employee>(`/hr/employees/${target.id}`);
  expect(saved).toMatchObject({ insuranceStatus: 'INSURED', insuranceNumber, insuredSalary: 950_000, iban: IBAN });

  // ── Photo on the card and profile; the silhouette elsewhere ──────────────────
  await page.goto(`/${locale}/employees`);
  await searchField(page, t(locale, 'employees.list.searchLabel')).fill(withPhoto.code);
  await expect(avatarOf(page, name(withPhoto))).toHaveAttribute('data-avatar', 'photo');
  // The image really loads (signed-in only, through the web origin).
  await expect
    .poll(() => avatarOf(page, name(withPhoto)).locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await shoot(page, info, `employee-photo-card-${tag}`);

  await searchField(page, t(locale, 'employees.list.searchLabel')).fill(target.code);
  await expect(avatarOf(page, name(target))).toHaveAttribute('data-avatar', 'silhouette');

  await page.goto(`/${locale}/employees/${withPhoto.id}`);
  const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
  await expect(header.locator('[data-avatar]')).toHaveAttribute('data-avatar', 'photo');
  await shoot(page, info, `employee-photo-profile-${tag}`);

  // Signed out, the photo isn't served.
  const url = (await api.get<Employee>(`/hr/employees/${withPhoto.id}`)).photoUrl!;
  const anonymous = await page.context().browser()!.newContext();
  const res = await anonymous.request.get(new URL(url, page.url()).toString());
  expect(res.status()).toBe(401);
  await anonymous.close();
  await api.dispose();
}

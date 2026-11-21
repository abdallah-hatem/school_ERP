import { expect, test } from '@playwright/test';
import { EmployeeStatus, PAGINATION, PenaltyStatus, type EmployeeSummary, type PenaltyRecord } from '@school-erp/shared';
import { Api } from './support/api';
import { checkCatalogueSearch, showOncePerDaySwitch, usableCatalogue } from './support/catalogue-search';
import { todayIso } from './support/dates';
import { prefixOf, t } from './support/i18n';
import { settle, shoot, signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/*
 * §4 / §7 (owner, 2026-11-18): the catalogue search, the "Once per day" switch, and the rule itself.
 * Runs before 05-payroll approves this month: it records today, then cancels what it recorded.
 */

for (const locale of ['en', 'ar'] as const) {
  test(`catalogue search (${locale}): a violation's name in either language finds it; no match → Clear filters`, async ({ page }, info) => {
    await signIn(page, locale);
    await checkCatalogueSearch(page, info, locale, `desktop-${locale}`);
    await showOncePerDaySwitch(page, info, locale, `desktop-${locale}`);
  });
}

test('once per day: the same violation twice on one day for one employee → the preview and the save refuse it', async ({ page }, info) => {
  const api = await Api.asAdmin();
  const today = todayIso();
  const violation = (await usableCatalogue(api)).find(({ violation: v }) => v.oncePerDay)?.violation;
  const employees = await api.get<EmployeeSummary[]>('/hr/employees', { status: EmployeeStatus.ACTIVE, limit: PAGINATION.maxLimit });
  // Someone with nothing recorded for it today.
  const thisMonth = await api.get<PenaltyRecord[]>('/hr/penalties', { limit: PAGINATION.maxLimit, month: today.slice(0, 7) });
  const taken = new Set(thisMonth.filter((p) => p.date === today && p.violation.id === violation?.id).map((p) => p.employee.id));
  const employee = employees.find((e) => !taken.has(e.id));
  if (!violation || !employee) throw new Error('smoke: no once-per-day violation or free employee');
  const recorded: string[] = [];

  try {
    await signIn(page, 'en');
    await page.goto('/en/penalties');
    const fill = async () => {
      await page.getByRole('button', { name: t('en', 'penalties.record') }).first().click();
      const dialog = page.getByRole('dialog', { name: t('en', 'penalties.form.title') });
      await dialog.getByRole('combobox', { name: t('en', 'penalties.form.employee') }).click();
      await page.getByRole('searchbox', { name: t('en', 'penalties.form.employeeSearch') }).fill(employee.code);
      await page.getByRole('option', { name: `${employee.nameEn} · ${employee.code}`, exact: true }).click();
      await dialog.getByRole('combobox', { name: t('en', 'penalties.form.violation') }).click();
      // The picker searches the Arabic name too.
      await page.getByRole('searchbox', { name: t('en', 'penalties.form.violationSearch') }).fill(violation.nameAr);
      await page.getByRole('option', { name: violation.nameEn, exact: true }).click();
      return dialog;
    };

    // First one today: saved as pending.
    let dialog = await fill();
    await expect(dialog.getByTestId('penalty-preview')).toContainText(prefixOf('en', 'penalties.preview.line', {}));
    await dialog.getByRole('button', { name: t('en', 'penalties.form.save') }).click();
    await expect(dialog).toBeHidden();
    const mine = await api.get<PenaltyRecord[]>('/hr/penalties', { employeeId: employee.id, status: 'OPEN', limit: PAGINATION.maxLimit });
    recorded.push(...mine.filter((p) => p.violation.id === violation.id && p.date === today).map((p) => p.id));
    expect(recorded).toHaveLength(1);

    // Second one, same day: the preview says so before saving, and the save is refused under the date.
    dialog = await fill();
    const message = t('en', 'errors.VIOLATION_ONCE_PER_DAY');
    await expect(dialog.getByTestId('penalty-preview')).toHaveText(message);
    await dialog.getByRole('button', { name: t('en', 'penalties.form.save') }).click();
    // Shown once (dry run 2026-11-18): under the date, the preview stepping aside.
    await expect(dialog.getByText(message)).toHaveCount(1);
    await expect(dialog.getByTestId('penalty-preview')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await settle(page);
    await shoot(page, info, 'once-per-day-refused');
    await page.keyboard.press('Escape');

    // Still only the one.
    const after = await api.get<PenaltyRecord[]>('/hr/penalties', { employeeId: employee.id, limit: PAGINATION.maxLimit });
    expect(after.filter((p) => p.violation.id === violation.id && p.date === today && p.status !== PenaltyStatus.CANCELLED)).toHaveLength(1);
  } finally {
    // Leave nothing pending for this month's payroll (05).
    for (const id of recorded) await api.post(`/hr/penalties/${id}/cancel`, { reason: 'smoke: once-per-day check' });
    await api.dispose();
  }
});

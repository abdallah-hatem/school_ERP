import { expect, test, type Page } from '@playwright/test';
import {
  formatMoney,
  latenessDays,
  PAGINATION,
  PayrollStatus,
  PenaltyStatus,
  type HrSettings,
  type LatenessRule,
  type PayrollLine,
  type PayrollRun,
  type PayrollRunSummary,
  type PenaltyRecord,
} from '@school-erp/shared';
import { Api } from './support/api';
import { currentMonth } from './support/dates';
import { prefixOf, t } from './support/i18n';
import { searchField, shoot, signIn } from './support/ui';

/** Grace minutes added in Settings; moves the days of the minutes entered by 04-lateness. */
const EXTRA_GRACE = 30;

let restoreGrace: number | null = null;

test.afterAll(async () => {
  if (restoreGrace === null) return;
  const api = await Api.asAdmin();
  await api.patch('/hr/settings', { lateness: { graceMinutes: restoreGrace } });
  await api.dispose();
});

/** The run's line row for one employee (searched by code, so it is on the first page). */
async function lineRow(page: Page, line: PayrollLine) {
  await searchField(page, t('en', 'payroll.filters.searchLabel')).fill(line.employeeCode);
  const row = page.getByRole('row').filter({ hasText: line.employeeCode });
  await expect(row).toHaveCount(1);
  return row;
}

async function recalculate(page: Page) {
  // `exact`: the stale-flags hint has its own "Recalculate now" button.
  await page.getByRole('button', { name: t('en', 'payroll.actions.recalculate'), exact: true }).click();
  await expect(page.getByText(t('en', 'payroll.actions.recalculated'))).toBeVisible();
}

test('payroll: run → penalty deduction → grace change → recalculate → approve → payslip → bank sheet', async ({
  page,
}, info) => {
  const month = currentMonth();
  const api = await Api.asAdmin();

  // Pending penalties block approval (§6); the smoke database clears this month's first.
  const pending = await api.get<PenaltyRecord[]>('/hr/penalties', {
    month,
    status: PenaltyStatus.PENDING,
    limit: PAGINATION.maxLimit,
  });
  for (const p of pending) {
    await api.post(`/hr/penalties/${p.id}/cancel`, {
      reason: 'Smoke check: cleared before approving payroll',
    });
  }

  await signIn(page, 'en');
  await page.goto('/en/payroll');
  await shoot(page, info, 'payroll-runs');

  // Create this month's run, or open it when it already exists.
  const runs = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', {
    limit: PAGINATION.maxLimit,
  });
  const existing = runs.find((r) => r.month === month);
  if (existing) {
    expect(existing.status).toBe(PayrollStatus.DRAFT);
    await page.goto(`/en/payroll/${existing.id}`);
  } else {
    await page
      .getByRole('button', { name: t('en', 'payroll.create.action') })
      .first()
      .click();
    const dialog = page.getByRole('dialog', {
      name: t('en', 'payroll.create.title'),
    });
    await dialog
      .getByRole('button', {
        name: prefixOf('en', 'payroll.create.confirm', {}),
      })
      .click();
  }
  await expect(page).toHaveURL(/\/en\/payroll\/[0-9a-f-]{36}$/);
  const runId = page.url().split('/').pop() ?? '';

  // Bring the run up to date with the penalty (03) and lateness (04) recorded today.
  await recalculate(page);
  const first = await api.get<PayrollRun>(`/hr/payroll-runs/${runId}`);
  await shoot(page, info, 'payroll-run-draft');

  const penalised = first.lines.find((l) => l.penaltyAmount > 0);
  if (!penalised) throw new Error('smoke: no line has a penalty deduction — did 03-penalties run?');
  await expect(await lineRow(page, penalised)).toContainText(formatMoney(penalised.penaltyAmount));

  // A line whose lateness days move when the grace grows.
  const settings = await api.get<HrSettings>('/hr/settings');
  const rule: LatenessRule = {
    ...settings.lateness,
    graceMinutes: settings.lateness.graceMinutes + EXTRA_GRACE,
  };
  const late = first.lines.find(
    (l) => l.latenessMinutes > 0 && latenessDays(l.latenessMinutes, rule) !== l.latenessDays,
  );
  if (!late) throw new Error('smoke: no line whose lateness changes with the grace — did 04-lateness run?');

  // Change the lateness rule in Settings.
  await page.goto('/en/settings?section=hrRules');
  const graceField = page.getByLabel(t('en', 'settings.hrRules.lateness.grace'));
  // Until the saved rule loads, the section shows the form itself as an inert skeleton
  // (`SkeletonMask`, aria-busy) holding the defaults, and the saved grace is often the default 0, so
  // the value alone can't tell the load has finished. Typing into the skeleton is lost when the real
  // form replaces it, leaving Save disabled. Wait for the skeleton to go first.
  await expect(
    page.locator('[aria-busy="true"]').filter({ has: page.locator('input[name="graceMinutes"]') }),
  ).toHaveCount(0);
  await expect(graceField).toHaveValue(String(settings.lateness.graceMinutes));
  // Clear before each try: the field keeps the typed text as a draft until blur, so re-filling the
  // same text after a lost change fires no input event and Save would stay disabled for good.
  await expect(async () => {
    await graceField.fill('');
    await graceField.fill(String(rule.graceMinutes));
    await expect(page.getByRole('button', { name: t('en', 'common.actions.save'), exact: true })).toBeEnabled({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  restoreGrace = settings.lateness.graceMinutes;
  await page.getByRole('button', { name: t('en', 'common.actions.save'), exact: true }).click();
  await expect(page.getByText(t('en', 'settings.save.saved'))).toBeVisible();
  await shoot(page, info, 'settings-hr-rules');

  // Recalculate: the late employee's numbers change.
  await page.goto(`/en/payroll/${runId}`);
  await recalculate(page);
  const second = await api.get<PayrollRun>(`/hr/payroll-runs/${runId}`);
  const after =
    second.lines.find((l) => l.id === late.id) ?? second.lines.find((l) => l.employeeId === late.employeeId);
  if (!after) throw new Error('smoke: the late employee left the run');
  expect(after.latenessDays).toBe(latenessDays(late.latenessMinutes, rule));
  expect(after.latenessAmount).toBeLessThan(late.latenessAmount);
  expect(after.net).toBeGreaterThan(late.net);
  const lateRow = await lineRow(page, after);
  await expect(lateRow).toContainText(formatMoney(after.latenessAmount));
  await expect(lateRow).toContainText(formatMoney(after.net));

  // Approve.
  await searchField(page, t('en', 'payroll.filters.searchLabel')).fill('');
  // Clearing the search navigates after a debounce. Wait for it to land: a navigation still in
  // flight when Approve answers re-renders the page with the run as it was (Draft).
  await expect(page).not.toHaveURL(/[?&]search=/);
  await page.getByRole('button', { name: t('en', 'payroll.actions.approve') }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByRole('button', { name: t('en', 'payroll.approve.confirm') }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText(t('en', 'payroll.actions.approved'))).toBeVisible();
  await expect(page.getByRole('button', { name: t('en', 'payroll.actions.recalculate') })).toHaveCount(0);
  const approved = await api.get<PayrollRun>(`/hr/payroll-runs/${runId}`);
  expect(approved.status).toBe(PayrollStatus.APPROVED);
  await shoot(page, info, 'payroll-run-approved');

  // The penalised employee's payslip shows the approved net.
  const line = approved.lines.find((l) => l.employeeId === penalised.employeeId);
  if (!line) throw new Error('smoke: the penalised employee left the run');
  await lineRow(page, line);
  await page
    .getByRole('button', {
      name: t('en', 'ui.table.actionsFor', { name: line.nameEn }),
      exact: true,
    })
    .click();
  await page.getByRole('menuitem', { name: t('en', 'payroll.table.payslip'), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/payslip/${line.id}$`));
  const payslip = page.getByRole('article', {
    name: t('en', 'payroll.payslip.title'),
  });
  await expect(payslip).toContainText(formatMoney(line.net));
  await expect(payslip.getByTestId('payslip-penalty').first()).toBeVisible();
  await shoot(page, info, 'payslip');

  // The bank sheet downloads.
  await page.goto(`/en/payroll/${runId}`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: t('en', 'payroll.actions.exportBankSheet') }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  await api.dispose();
});

import { expect, test } from '@playwright/test';
import {
  EmployeeStatus,
  PAGINATION,
  PenaltyStatus,
  type EmployeeSummary,
  type PenaltyGroup,
  type PenaltyPreview,
  type PenaltyRecord,
  type Violation,
} from '@school-erp/shared';
import { Api } from './support/api';
import { todayIso } from './support/dates';
import { prefixOf, t } from './support/i18n';
import { shoot, signIn } from './support/ui';

interface Target {
  employee: EmployeeSummary;
  violation: Violation;
}

async function all<T>(api: Api, path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page += 1) {
    const rows = await api.get<T[]>(path, {
      ...params,
      page,
      limit: PAGINATION.maxLimit,
    });
    out.push(...rows);
    if (rows.length < PAGINATION.maxLimit) return out;
  }
}

const deducts = (p: { days: number | null }) => (p.days ?? 0) > 0;

/**
 * An active employee and a violation in use for which a penalty dated today would be level 2 with
 * a day deduction — read from the approved penalties already there. When none fits (the seed's
 * month is outside today's repetition window), one is made: a level-1 penalty, recorded and
 * approved through the API.
 */
async function findTarget(api: Api, today: string): Promise<Target> {
  const employees = await all<EmployeeSummary>(api, '/hr/employees', {
    status: EmployeeStatus.ACTIVE,
  });
  const groups = await api.get<PenaltyGroup[]>('/hr/penalty-groups');
  const violations = groups.filter((g) => g.isActive).flatMap((g) => g.violations.filter((v) => v.isActive));
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const activeEmployees = byId(employees);
  const usableViolations = byId(violations);

  const approved = await all<PenaltyRecord>(api, '/hr/penalties', {
    status: PenaltyStatus.APPROVED,
  });
  const seen = new Set<string>();
  for (const p of approved) {
    const key = `${p.employee.id}|${p.violation.id}`;
    const employee = activeEmployees.get(p.employee.id);
    const violation = usableViolations.get(p.violation.id);
    if (seen.has(key) || !employee || !violation) continue;
    seen.add(key);
    const preview = await api.get<PenaltyPreview>('/hr/penalties/preview', {
      employeeId: employee.id,
      violationId: violation.id,
      date: today,
    });
    if (preview.level === 2 && deducts(preview)) return { employee, violation };
  }

  const violation = violations.find((v) => deducts(v.levels.find((l) => l.level === 2) ?? { days: null }));
  const penalised = new Set(approved.map((p) => p.employee.id));
  const employee = employees.find((e) => !penalised.has(e.id));
  if (!violation || !employee) throw new Error('smoke: no violation with a level-2 day deduction to use');
  const prior = await api.post<PenaltyRecord>('/hr/penalties', {
    employeeId: employee.id,
    violationId: violation.id,
    date: today,
    note: null,
  });
  await api.post(`/hr/penalties/${prior.id}/approve`);
  return { employee, violation };
}

test('penalties: a repeat is previewed as level 2 → saved → approved → listed as approved', async ({ page }, info) => {
  const today = todayIso();
  const api = await Api.asAdmin();
  const { employee, violation } = await findTarget(api, today);
  const filtered = (status: PenaltyStatus) =>
    `/en/penalties?status=${status}&search=${encodeURIComponent(employee.code)}`;

  await signIn(page, 'en');
  await page.goto('/en/penalties');
  await shoot(page, info, 'penalties-list');

  await page
    .getByRole('button', { name: t('en', 'penalties.record') })
    .first()
    .click();
  const dialog = page.getByRole('dialog', {
    name: t('en', 'penalties.form.title'),
  });
  await dialog.getByRole('combobox', { name: t('en', 'penalties.form.employee') }).click();
  await page
    .getByRole('option', {
      name: `${employee.nameEn} · ${employee.code}`,
      exact: true,
    })
    .click();
  await dialog.getByRole('combobox', { name: t('en', 'penalties.form.violation') }).click();
  await page.getByRole('option', { name: violation.nameEn, exact: true }).click();

  // The date defaults to today; the live preview gives the level before anything is saved.
  await expect(dialog.getByTestId('penalty-preview')).toContainText(
    prefixOf('en', 'penalties.preview.line', { level: 2 }),
  );
  await shoot(page, info, 'penalty-record-dialog');
  await dialog.getByRole('button', { name: t('en', 'penalties.form.save') }).click();
  await expect(dialog).toBeHidden();

  await page.goto(filtered(PenaltyStatus.PENDING));
  await page
    .getByRole('button', {
      name: t('en', 'penalties.approve.buttonFor', { name: employee.nameEn }),
    })
    .click();
  const confirm = page.getByRole('dialog', {
    name: t('en', 'penalties.approve.title'),
  });
  await confirm
    .getByRole('button', {
      name: t('en', 'penalties.approve.confirm'),
      exact: true,
    })
    .click();
  await expect(confirm).toBeHidden();

  await page.goto(filtered(PenaltyStatus.APPROVED));
  const row = page
    .getByRole('table')
    .getByRole('row')
    .filter({ hasText: violation.nameEn })
    .filter({ hasText: t('en', 'penalties.levelValue', { level: 2 }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(t('en', 'common.enums.penaltyStatus.APPROVED'));
  await shoot(page, info, 'penalties-approved');

  // The server agrees: the new penalty is approved at level 2 with its day deduction fixed.
  const records = await api.get<PenaltyRecord[]>('/hr/penalties', {
    employeeId: employee.id,
    status: PenaltyStatus.APPROVED,
    limit: PAGINATION.maxLimit,
  });
  const saved = records.find((r) => r.violation.id === violation.id && r.date === today && r.level === 2);
  expect(saved && deducts(saved)).toBe(true);
  await api.dispose();
});

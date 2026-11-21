import { expect, test } from '@playwright/test';
import {
  EmployeeStatus,
  PAGINATION,
  type EmployeeSummary,
  type PenaltyGroup,
  type PenaltyRecord,
  type Stage,
} from '@school-erp/shared';
import { signInAs } from './support/access';
import { Api } from './support/api';
import { env } from './support/env';
import { t } from './support/i18n';
import { openDay } from './support/penalties';
import { settled } from './support/role-access';
import { settle, shoot } from './support/ui';

/**
 * Runs in the `desktop-en` project (1440×900). §4 two steps and §3 several stages (owner
 * 2026-11-21), end to end on the seeded demo: the primary head records a penalty for the
 * multi-stage teacher **in prep** → it waits for the prep head (Pending stage review) → the prep
 * head approves it from the list (→ Waiting for HR) and rejects another with a reason → the
 * primary head never sees either (404). The seed's stage heads sign in with the admin's password.
 */

const locale = 'en' as const;
const PRIMARY_HEAD = 'primary.head@school.local';
const PREP_HEAD = 'prep.head@school.local';

test('the stage review: recorded in prep → the prep head approves one and rejects one; the primary head never sees them', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const admin = await Api.asAdmin();
  const stages = await admin.get<Stage[]>('/stages', { limit: 100, includeHidden: true });
  const prep = stages.find((s) => s.nameEn === 'Preparatory');
  expect(prep, 'the seed has a Preparatory stage').toBeDefined();
  const inPrep = await admin.get<EmployeeSummary[]>('/hr/employees', {
    stageId: prep!.id,
    status: EmployeeStatus.ACTIVE,
    limit: PAGINATION.maxLimit,
  });
  // The seed's multi-stage teacher: main stage elsewhere, also teaches in prep.
  const teacher = inPrep.find((e) => e.stage.id !== prep!.id && e.otherStages.some((s) => s.id === prep!.id));
  expect(teacher, 'the seed has a teacher who also teaches in prep').toBeDefined();
  const groups = await admin.get<PenaltyGroup[]>('/hr/penalty-groups');
  const repeatable = groups
    .filter((g) => g.isActive)
    .flatMap((g) => g.violations)
    .find((v) => v.isActive && !v.oncePerDay);
  expect(repeatable, 'the catalogue has a violation that may repeat in a day').toBeDefined();
  const date = await openDay(admin);
  await admin.dispose();

  // The primary head records two in prep: not their stage, so their recording is no review.
  const primaryHead = await Api.as(PRIMARY_HEAD, env.adminPassword);
  const record = () =>
    primaryHead.post<PenaltyRecord>('/hr/penalties', {
      employeeId: teacher!.id,
      violationId: repeatable!.id,
      stageId: prep!.id,
      date,
      note: 'Smoke: two-step review',
    });
  const toApprove = await record();
  const toReject = await record();
  expect(toApprove).toMatchObject({ status: 'PENDING_REVIEW', stage: { id: prep!.id } });

  await signInAs(page, locale, PREP_HEAD, env.adminPassword);
  await page.goto(`/${locale}/penalties?month=${date.slice(0, 7)}&status=PENDING_REVIEW&stageId=${prep!.id}`);
  await settled(page);
  await settle(page);
  await shoot(page, info, 'penalty-two-step-list');

  // Approve the first (the review's own dialog, with an optional note).
  const rowName = t(locale, 'ui.table.actionsFor', { name: `${teacher!.nameEn} · ${repeatable!.nameEn}` });
  await page.goto(`/${locale}/penalties?penalty=${toApprove.id}`);
  const details = page.getByRole('dialog', { name: t(locale, 'penalties.details.title') });
  await expect(details).toBeVisible();
  await expect(details.getByTestId('penalty-steps')).toContainText(
    t(locale, 'penalties.steps.waitingReview', { stage: prep!.nameEn }),
  );
  await details.getByRole('button', { name: t(locale, 'penalties.review.approve.button') }).click();
  const confirm = page.getByRole('dialog', { name: t(locale, 'penalties.review.approve.title') });
  await confirm.getByRole('textbox').fill('Checked with the timetable');
  await shoot(page, info, 'penalty-two-step-review');
  await confirm.getByRole('button', { name: t(locale, 'penalties.review.approve.confirm') }).click();
  await expect(confirm).toBeHidden();
  await expect(details).toContainText(t(locale, 'common.enums.penaltyStatus.WAITING_HR'));

  // Reject the second from the list's ⋯ menu, with a reason.
  await page.goto(`/${locale}/penalties?month=${date.slice(0, 7)}&status=PENDING_REVIEW&stageId=${prep!.id}`);
  await settled(page);
  await page.getByRole('button', { name: rowName }).first().click();
  await page.getByRole('menuitem', { name: t(locale, 'penalties.reject.button') }).click();
  const reject = page.getByRole('dialog', { name: t(locale, 'penalties.reject.title') });
  const rejectButton = reject.getByRole('button', { name: t(locale, 'penalties.reject.confirm') });
  await expect(rejectButton).toBeDisabled();
  await reject.getByRole('textbox').fill('He was on an official task that day');
  await shoot(page, info, 'penalty-two-step-reject');
  await rejectButton.click();
  await expect(reject).toBeHidden();

  // The other stage's head (the recorder here) never sees them: 404, and their reject/approve 403.
  expect(await primaryHead.status('get', `/hr/penalties/${toApprove.id}`)).toBe(404);
  expect(await primaryHead.status('post', `/hr/penalties/${toReject.id}/review/approve`)).toBe(403);
  const rejected = await (await Api.asAdmin()).get<PenaltyRecord>(`/hr/penalties/${toReject.id}`);
  expect(rejected).toMatchObject({ status: 'REJECTED', rejectedStep: 'REVIEW', rejectionReason: 'He was on an official task that day' });
  await primaryHead.dispose();
});

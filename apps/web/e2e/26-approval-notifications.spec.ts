import { expect, test, type Page } from '@playwright/test';
import { BuiltInRole } from '@school-erp/shared';
import { Api } from './support/api';
import { t } from './support/i18n';
import { recordPenaltyToday } from './support/penalties';
import { makeRoleUser, settled, signInAsRoleUser } from './support/role-access';
import { settle, shoot } from './support/ui';

/**
 * Runs in the `desktop-en` project (1440×900). HR's approval notification end to end (§11, N2):
 * a penalty is recorded → the principal sees it in the bell → opening it lands on that penalty
 * (`/penalties?penalty=<id>`, its dialog over the list) → approving it there → the HR manager's
 * row reads "Approved by …". The admin records it, so both role users (made after every earlier
 * spec) are told, and their bells hold only this one.
 */

const locale = 'en' as const;
const bell = (page: Page) => page.getByTestId('notification-bell').filter({ visible: true });
const list = (page: Page) => page.getByRole('dialog', { name: t(locale, 'notifications.title') });

test('a recorded penalty reaches the principal’s bell, opens on itself, and reads “Approved by …” for the HR manager', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const viewport = { width: 1440, height: 900 };
  const principal = await makeRoleUser(BuiltInRole.PRINCIPAL);
  const hrManager = await makeRoleUser(BuiltInRole.HR_MANAGER);
  const principalPage = await signInAsRoleUser(browser, principal, locale, viewport);
  const hrPage = await signInAsRoleUser(browser, hrManager, locale, viewport);

  const api = await Api.asAdmin();
  const penalty = await recordPenaltyToday(api);
  await api.dispose();
  const employee = penalty.employee.nameEn;

  // The principal: the count on the bell (on focus / reload), the row in the list.
  await principalPage.reload();
  await settled(principalPage);
  await expect(bell(principalPage)).toHaveAccessibleName(new RegExp(t(locale, 'notifications.bell.unread', { count: 1 })));
  await bell(principalPage).click();
  const row = list(principalPage).getByTestId('notification-row').filter({ hasText: employee });
  await expect(row).toBeVisible();
  await expect(row).toContainText(t(locale, 'notifications.types.hr.penalty.awaiting_approval.title'));

  // Opening it lands on that penalty: its month's list, the penalty open over it.
  await row.getByRole('link').first().click();
  await expect(principalPage).toHaveURL(new RegExp(`/en/penalties\\?penalty=${penalty.id}$`));
  const details = principalPage.getByRole('dialog', { name: t(locale, 'penalties.details.title') });
  await expect(details).toBeVisible();
  await expect(details).toContainText(employee);
  await expect(details).toContainText(t(locale, 'penalties.levelValue', { level: penalty.level }));
  await settle(principalPage);
  await shoot(principalPage, info, 'penalty-deep-link-en-desktop');

  // Approve from the dialog; it then shows the penalty as approved, with no Approve left.
  await details.getByRole('button', { name: t(locale, 'penalties.approve.button') }).click();
  const confirm = principalPage.getByRole('dialog', { name: t(locale, 'penalties.approve.title') });
  await confirm.getByRole('button', { name: t(locale, 'penalties.approve.confirm') }).click();
  await expect(confirm).toBeHidden();
  await expect(details).toContainText(t(locale, 'common.enums.penaltyStatus.APPROVED'));
  await expect(details.getByRole('button', { name: t(locale, 'penalties.approve.button') })).toHaveCount(0);

  // Closing it drops the link's ?penalty and keeps the list.
  await details.getByRole('button', { name: t(locale, 'ui.dialog.close') }).last().click();
  await expect(details).toBeHidden();
  await expect(principalPage).not.toHaveURL(/penalty=/);

  // The HR manager was told too: their row now reads "Approved by <the principal>", out of the count.
  await hrPage.reload();
  await settled(hrPage);
  await expect(bell(hrPage)).toHaveAccessibleName(t(locale, 'notifications.bell.label'));
  await bell(hrPage).click();
  const done = list(hrPage).getByTestId('notification-row').filter({ hasText: employee });
  await expect(done).toContainText(t(locale, 'notifications.resolved.approved', { name: 'Smoke Principal / administrative director' }));
  await settle(hrPage);
  await shoot(hrPage, info, 'penalty-approved-by-en-desktop');

  await principalPage.context().close();
  await hrPage.context().close();
});

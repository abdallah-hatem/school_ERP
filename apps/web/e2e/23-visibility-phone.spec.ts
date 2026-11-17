import { expect, test } from '@playwright/test';
import { t } from './support/i18n';
import { expectNoHorizontalScroll, settle, shoot, signIn } from './support/ui';
import { expectNotFound, makeStageHead, salaryInContract, signInAsStageHead } from './support/visibility';

/**
 * Runs in the `phone-ar` project only (390×844, touch). P4 on a phone: the Stage head's employees,
 * profile and the not-found screen, in Arabic and English — next to the HR manager's profile.
 */

for (const locale of ['ar', 'en'] as const) {
  test(`P4 on a phone (${locale}): Stage head vs HR manager`, async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    const setup = await makeStageHead();
    const head = await signInAsStageHead(browser, setup, locale, { width: 390, height: 844 }, 'stage-head-phone-password-1');

    await head.goto(`/${locale}/employees`);
    await expect(head.getByRole('article').first()).toBeVisible();
    await expect(head.getByText(t(locale, 'employees.columns.basicSalary'))).toHaveCount(0);
    await expectNoHorizontalScroll(head);
    await settle(head);
    await shoot(head, info, `p4-stage-head-employees-${locale}-phone`);

    await head.goto(`/${locale}/employees/${setup.own.id}`);
    await expect(head.getByText(t(locale, 'employees.fields.basicSalary'))).toHaveCount(0);
    await expectNoHorizontalScroll(head);
    await settle(head);
    await shoot(head, info, `p4-stage-head-profile-${locale}-phone`);

    await head.goto(`/${locale}/employees/${setup.outside.id}`);
    await expectNotFound(head, locale);
    await shoot(head, info, `p4-stage-head-not-found-${locale}-phone`);
    await head.context().close();

    await signIn(page, locale);
    await page.goto(`/${locale}/employees/${setup.own.id}`);
    // Exactly once, in the Pay and contract card (the Stage head's checks above count it anywhere: 0).
    await expect(salaryInContract(page, locale)).toBeVisible();
    await settle(page);
    await shoot(page, info, `p4-hr-manager-profile-${locale}-phone`);
  });
}

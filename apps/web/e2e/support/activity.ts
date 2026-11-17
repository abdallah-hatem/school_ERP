import { expect, type Browser, type Locator, type Page, type TestInfo } from '@playwright/test';
import { Weekday, type AuditEntry, type Language } from '@school-erp/shared';
import { Api } from './api';
import { literal, t } from './i18n';
import { shoot } from './ui';

/*
 * The activity log in the smoke specs (T30): a school-settings change made through the Settings
 * screen must show at the top of Activity, in both languages, and through Settings' "View change
 * history" link. Shared by the desktop and phone specs.
 */

/** The working-days chip toggled back and forth (it changes no other spec's numbers). */
const DAY = Weekday.SATURDAY;

/** Toggles Saturday as a working day on the Settings screen and saves; returns whether it is now on. */
export async function changeWorkingDays(page: Page, locale: Language): Promise<boolean> {
  await page.goto(`/${locale}/settings?section=school`);
  const days = page.getByRole('group', { name: t(locale, 'settings.school.workingDays') });
  const chip = days.getByRole('button', { name: t(locale, `common.enums.weekday.${DAY}`), exact: true });
  await expect(chip).toBeEnabled();
  // The form shows placeholder values while it loads; wait for the real name.
  await expect(page.getByLabel(t(locale, 'settings.school.nameEn'))).not.toHaveValue('');
  const wasOn = (await chip.getAttribute('aria-pressed')) === 'true';
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', String(!wasOn));
  await page.getByRole('button', { name: t(locale, 'common.actions.save'), exact: true }).click();
  await expect(page.getByText(t(locale, 'settings.save.saved'))).toBeVisible();
  return !wasOn;
}

/** The newest entry on the page. */
export function firstEntry(page: Page): Locator {
  return page.getByTestId('audit-entry').first();
}

/** Asserts `entry` is the working-days change just made, by the signed-in admin. */
export async function expectWorkingDaysEntry(entry: Locator, locale: Language, adminName: string): Promise<void> {
  await expect(entry).toContainText(adminName);
  await expect(entry).toContainText(literal(t(locale, 'audit.actions.core.settings.update').slice(1)));
  await expect(entry).toContainText(t(locale, 'audit.fields.school.workingDays'));
  await expect(entry).toContainText(t(locale, `common.enums.weekday.${DAY}`));
}

/**
 * A screenshot of a route's loading skeleton, as the server streams it first: with JavaScript off
 * the content never swaps in, so the skeleton stays on screen (same trick as 09-skeletons).
 */
export async function shootSkeleton(browser: Browser, page: Page, info: TestInfo, path: string, name: string): Promise<void> {
  const noScript = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: false,
    viewport: page.viewportSize(),
    baseURL: new URL(page.url()).origin,
  });
  const skeletonPage = await noScript.newPage();
  await skeletonPage.goto(path);
  await expect(skeletonPage.locator('#main [aria-busy="true"]').first()).toBeAttached();
  await shoot(skeletonPage, info, name);
  await noScript.close();
}

/** The signed-in admin's name, as the timeline shows it beside each sentence. */
export async function adminName(): Promise<string> {
  const api = await Api.asAdmin();
  const me = await api.get<{ name: string }>('/auth/me');
  await api.dispose();
  return me.name;
}

/** Entries recorded on one employee (none until T28 wires the employee service). */
export async function employeeEntries(employeeId: string): Promise<AuditEntry[]> {
  const api = await Api.asAdmin();
  const entries = await api.get<AuditEntry[]>(`/audit/records/employee/${employeeId}`, { limit: 10 });
  await api.dispose();
  return entries;
}

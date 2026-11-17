import { expect, type Page, type TestInfo } from '@playwright/test';
import { EmployeeStatus, type Employee, type EmployeeSummary, type Language } from '@school-erp/shared';
import { Api } from './api';
import { t } from './i18n';
import { expectNoHorizontalScroll, settle, shoot } from './ui';

/*
 * The employee profile's header (name, status, code line, Edit / Deactivate) and tab bar live in
 * the profile layout, so switching Details → Penalties → Payroll renders only the tab: the header
 * stays the same DOM node the whole time and never turns into a skeleton (no remount, no second
 * fetch of the employee). Shared by the desktop and phone specs.
 */

type Watch = { lost: boolean; headerSkeleton: boolean; listSkeleton: boolean };
type WatchWindow = Window & { __profileH1?: Element | null; __profileWatch?: Watch };

/** An active employee from the seed, with their full record (names, code). */
export async function activeEmployee(): Promise<Employee> {
  const api = await Api.asAdmin();
  const [summary] = await api.get<EmployeeSummary[]>('/hr/employees', { status: EmployeeStatus.ACTIVE, limit: 1 });
  if (!summary) throw new Error('smoke: the seed has no active employee');
  const employee = await api.get<Employee>(`/hr/employees/${summary.id}`);
  await api.dispose();
  return employee;
}

/** Starts recording, in the page, whether the profile's `<h1>` is replaced or a skeleton shows up. */
async function watchHeader(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as WatchWindow;
    const main = document.getElementById('main');
    w.__profileH1 = main?.querySelector('h1') ?? null;
    w.__profileWatch = { lost: false, headerSkeleton: false, listSkeleton: false };
    const check = () => {
      const watch = w.__profileWatch!;
      const h1 = document.getElementById('main')?.querySelector('h1');
      if (!w.__profileH1?.isConnected || h1 !== w.__profileH1) watch.lost = true;
      if (document.querySelector('#main h1 [data-slot="skeleton"]')) watch.headerSkeleton = true;
    };
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

async function watched(page: Page): Promise<Watch & { same: boolean }> {
  return page.evaluate(() => {
    const w = window as WatchWindow;
    const h1 = document.getElementById('main')?.querySelector('h1');
    return { ...w.__profileWatch!, same: !!h1 && h1 === w.__profileH1 };
  });
}

/** Opens a profile from the list (no list skeleton on the way) and walks its three tabs. */
export async function checkProfileTabs(page: Page, info: TestInfo, locale: Language, tag: string): Promise<void> {
  const employee = await activeEmployee();
  const name = locale === 'ar' ? employee.nameAr : employee.nameEn;
  const profile = `/${locale}/employees/${employee.id}`;
  const heading = page.getByRole('heading', { level: 1, name, exact: true });
  const tabs = page.getByRole('navigation', { name: t(locale, 'employees.profile.tabs') });
  const idle = () => expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);

  // First navigation from the list: the profile's own skeleton or the profile, never the list's.
  await page.goto(`/${locale}/employees?search=${encodeURIComponent(employee.code)}`);
  const card = page.getByRole('link', { name, exact: true }).first();
  await expect(card).toBeVisible();
  await page.evaluate(() => {
    const seen = { list: false };
    (window as Window & { __listSeen?: typeof seen }).__listSeen = seen;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="employee-card-skeleton"]')) seen.list = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await card.click();
  await expect(page).toHaveURL(new RegExp(`${profile}$`));
  await expect(heading).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __listSeen?: { list: boolean } }).__listSeen?.list)).toBe(false);

  await idle();
  await expect(page.getByText(employee.code, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: t(locale, 'employees.profile.edit') })).toBeVisible();
  await expect(page.getByRole('button', { name: t(locale, 'employees.status.deactivate') })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await settle(page);
  await shoot(page, info, `profile-details-${tag}`);

  await watchHeader(page);
  const steps = [
    { label: t(locale, 'common.nav.penalties'), url: `${profile}/penalties`, shot: 'penalties' },
    { label: t(locale, 'common.nav.payroll'), url: `${profile}/payroll`, shot: 'payroll' },
    { label: t(locale, 'employees.profile.details'), url: profile, shot: 'details-again' },
  ];
  for (const step of steps) {
    const link = tabs.getByRole('link', { name: step.label, exact: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${step.url}$`));
    await expect(link).toHaveAttribute('aria-current', 'page');
    // The header is on screen the whole time: visible right after the click, and never replaced.
    await expect(heading).toBeVisible();
    await idle();
    await expect(heading).toBeVisible();
    await expectNoHorizontalScroll(page);
    await settle(page);
    if (step.shot !== 'details-again') await shoot(page, info, `profile-${step.shot}-${tag}`);
    const watch = await watched(page);
    expect(watch, `header after switching to ${step.shot}`).toEqual({
      lost: false,
      headerSkeleton: false,
      listSkeleton: false,
      same: true,
    });
  }
  await expect(page.getByRole('heading', { level: 2, name: t(locale, 'employees.sections.personal') })).toBeVisible();
}

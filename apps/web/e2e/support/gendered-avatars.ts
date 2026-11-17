import { expect, type Page, type TestInfo } from '@playwright/test';
import { EmployeeStatus, Gender, type EmployeeSummary, type Language } from '@school-erp/shared';
import { Api } from './api';
import { expectNoHorizontalScroll, shoot } from './ui';

/*
 * Owner, 2026-11-18: an employee without a photo shows a male or a female silhouette by gender;
 * a photo still wins. Seen on the employees cards, a penalties row and the profile header.
 * Used by 23-gendered-avatars*.
 */

const silhouette = (page: Page, gender: 'male' | 'female') => page.locator(`[data-avatar="silhouette"] [data-silhouette="${gender}"]:visible`);

export async function checkGenderedAvatars(page: Page, info: TestInfo, locale: Language, tag: string) {
  const api = await Api.asAdmin();
  const all = await api.get<EmployeeSummary[]>('/hr/employees', { status: EmployeeStatus.ACTIVE, limit: 100 });
  const without = all.filter((e) => !e.photoUrl);
  const woman = without.find((e) => e.gender === Gender.FEMALE);
  const man = without.find((e) => e.gender === Gender.MALE);
  if (!woman || !man) throw new Error('smoke: the seed needs a man and a woman without a photo');

  // ── Cards: both silhouettes and the one photo ───────────────────────────────
  await page.goto(`/${locale}/employees`);
  await expect(silhouette(page, 'male').first()).toBeVisible();
  await expect(silhouette(page, 'female').first()).toBeVisible();
  await expect(page.locator('[data-avatar="photo"]:visible').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shoot(page, info, `avatars-employees-${tag}`);

  // ── A penalties row ─────────────────────────────────────────────────────────
  await page.goto(`/${locale}/penalties`);
  // The table (wide) and the stacked cards (phone) are both in the page; one of them is shown.
  await expect(page.locator('[data-avatar] [data-silhouette]:visible, [data-avatar="photo"]:visible').first()).toBeVisible();
  await shoot(page, info, `avatars-penalties-${tag}`);

  // ── Profile headers ─────────────────────────────────────────────────────────
  for (const [who, gender] of [
    [woman, 'female'],
    [man, 'male'],
  ] as const) {
    await page.goto(`/${locale}/employees/${who.id}`);
    const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
    await expect(header.locator(`[data-silhouette="${gender}"]`)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shoot(page, info, `avatars-profile-${gender}-${tag}`);
  }
  await api.dispose();
}

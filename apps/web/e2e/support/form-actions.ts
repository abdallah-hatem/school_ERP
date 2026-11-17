import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { EmployeeSummary } from '@school-erp/shared';
import { Api } from './api';
import { t } from './i18n';
import { signIn } from './ui';

/** Long page forms keep Save / Cancel on screen (sticky action bar). Used by 17-form-actions*. */
async function expectInViewport(page: Page, name: string) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const box = await page.getByRole('button', { name, exact: true }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

export function formActionsSpecs(locale: 'en' | 'ar') {
  test(`form actions (${locale}): Save stays on screen at the top of the add and edit employee forms`, async ({ page }, info) => {
    await signIn(page, locale);

    await page.goto(`/${locale}/employees/new`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectInViewport(page, t(locale, 'employees.create.submit'));

    const api = await Api.asAdmin();
    const [employee] = await api.get<EmployeeSummary[]>('/hr/employees', { page: 1, limit: 1 });
    const id = employee?.id;
    if (!id) throw new Error('smoke: no employee to edit');
    await page.goto(`/${locale}/employees/${id}/edit`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectInViewport(page, t(locale, 'employees.edit.submit'));
    // Halfway down it is still there.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await expectInViewport(page, t(locale, 'employees.edit.submit'));
    // What the person sees mid-form (viewport, not full page — the bar is pinned to the viewport).
    await page.screenshot({ path: join(__dirname, '..', 'screenshots', info.project.name, `form-actions-edit-${locale}.png`) });
  });
}


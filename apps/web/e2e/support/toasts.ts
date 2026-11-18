import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { EmployeeStatus, type EmployeeSummary, type Language } from '@school-erp/shared';
import { join } from 'node:path';
import { Api } from './api';
import { t } from './i18n';
import { expectNoHorizontalScroll } from './ui';

/*
 * The Campus toasts and the Deactivate / Reactivate pair (fix/toast-and-status-buttons). A real
 * save raises the success toast and a real deactivate / reactivate flips the employee header; the
 * toast types no screen raises yet (warning, info, loading, an action) come from the smoke-only
 * `window.__e2eToast` hook (NEXT_PUBLIC_E2E_HOOKS, set by scripts/smoke.sh). Used by 23-toasts*.
 */

type ToastFn = (title: string, options?: Record<string, unknown>) => void;

const SCREENSHOTS_DIR = join(__dirname, '..', 'screenshots');

/** What is on screen (the toasts are fixed to the viewport), not the whole page. */
async function shootViewport(page: Page, info: TestInfo, name: string) {
  // Like settle(), but a loading toast's spinner turns forever.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
  await page.screenshot({ path: join(SCREENSHOTS_DIR, info.project.name, `${name}.png`) });
}

const toasts = (page: Page) => page.locator('[data-sonner-toast]');
const toastOf = (page: Page, type: string) => page.locator(`[data-sonner-toast][data-type="${type}"]`);

async function dismissAll(page: Page) {
  await page.evaluate(() => (window as unknown as { __e2eToast?: { dismiss: () => void } }).__e2eToast?.dismiss());
  await expect(toasts(page)).toHaveCount(0);
}

type Kind = 'success' | 'error' | 'warning' | 'info' | 'loading';
interface RaiseOptions {
  description?: string;
  /** An action button's label (its click does nothing here). */
  action?: string;
}

async function raise(page: Page, kind: Kind, title: string, options: RaiseOptions = {}) {
  await page.evaluate(
    ({ kind, title, options }) => {
      const hook = (window as unknown as { __e2eToast?: Record<Kind, ToastFn> }).__e2eToast;
      if (!hook) throw new Error('smoke: window.__e2eToast is missing — build with NEXT_PUBLIC_E2E_HOOKS=true');
      const { action, ...rest } = options;
      hook[kind](title, action ? { ...rest, action: { label: action, onClick: () => undefined } } : rest);
    },
    { kind, title, options },
  );
}

/** Every toast has its tone badge with an icon, and sits at the top end of the screen. */
async function expectCampusToast(page: Page, toast: Locator, locale: Language, closable = true) {
  await expect(toast).toBeVisible();
  await expect(toast.locator('[data-icon] svg')).toHaveCount(1);
  if (closable) await expect(toast.getByRole('button', { name: t(locale, 'ui.toast.close') })).toBeVisible();
  const box = (await toast.boundingBox())!;
  const width = page.viewportSize()!.width;
  const centre = box.x + box.width / 2;
  if (width >= 600) {
    // Desktop: the inline-end corner — right in English, left in Arabic.
    if (locale === 'ar') expect(centre).toBeLessThan(width / 2);
    else expect(centre).toBeGreaterThan(width / 2);
  }
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
}

export async function checkToastsAndStatus(page: Page, info: TestInfo, locale: Language, tag: string, offset: number) {
  const api = await Api.asAdmin();
  const all = await api.get<EmployeeSummary[]>('/hr/employees', { status: EmployeeStatus.ACTIVE, limit: 100 });
  await api.dispose();
  const target = all[(offset * 7 + 3) % all.length];
  if (!target) throw new Error('smoke: the seed needs active employees');
  const name = locale === 'ar' ? target.nameAr : target.nameEn;

  // ── Success: a real save ────────────────────────────────────────────────────
  await page.goto(`/${locale}/employees/${target.id}/edit`);
  await page.getByRole('textbox', { name: t(locale, 'employees.fields.bankName') }).fill(`Banque Misr ${tag}`);
  await page.getByRole('button', { name: t(locale, 'employees.edit.submit') }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/employees/${target.id}$`));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  // In the screen's language, naming them — not the API's generic English.
  await expect(toastOf(page, 'success')).toContainText(t(locale, 'employees.edit.done', { name }));
  await expectCampusToast(page, toastOf(page, 'success'), locale);
  await expectNoHorizontalScroll(page);
  await shootViewport(page, info, `toast-success-${tag}`);
  await dismissAll(page);

  // ── The header: Deactivate (destructive) on an active employee ─────────────
  const deactivate = page.getByRole('button', { name: t(locale, 'employees.status.deactivate'), exact: true });
  await expect(deactivate).toHaveAttribute('data-variant', 'destructive-outline');
  await shootViewport(page, info, `status-active-${tag}`);

  await deactivate.click();
  const dialog = page.getByRole('dialog', { name: t(locale, 'employees.status.deactivateTitle', { name }) });
  await dialog.getByRole('button', { name: t(locale, 'employees.status.deactivate'), exact: true }).click();
  await expect(dialog).toBeHidden();

  // ── Reactivate (positive) on the inactive one ───────────────────────────────
  const reactivate = page.getByRole('button', { name: t(locale, 'employees.status.reactivate'), exact: true });
  await expect(reactivate).toHaveAttribute('data-variant', 'success-soft');
  await expect(toastOf(page, 'success')).toContainText(t(locale, 'employees.status.deactivated', { name }));
  await expectCampusToast(page, toastOf(page, 'success'), locale);
  await dismissAll(page);
  await shootViewport(page, info, `status-inactive-${tag}`);

  // Put them back as they were (other specs count active staff).
  await reactivate.click();
  const back = page.getByRole('dialog', { name: t(locale, 'employees.status.reactivateTitle', { name }) });
  await back.getByRole('button', { name: t(locale, 'employees.status.reactivate'), exact: true }).click();
  await expect(back).toBeHidden();
  await expect(deactivate).toBeVisible();
  await dismissAll(page);

  // ── Error, warning and info, stacked with gaps ──────────────────────────────
  const ar = locale === 'ar';
  await raise(page, 'error', t(locale, 'employees.errors.saveFailed'), {
    description: t(locale, 'errors.DUPLICATE_NATIONAL_ID'),
  });
  await raise(page, 'warning', ar ? 'جزاءات بانتظار المراجعة' : 'Penalties waiting for review', {
    description: ar ? 'راجعها قبل اعتماد كشف الرواتب.' : 'Review them before approving the payroll run.',
  });
  await raise(page, 'info', ar ? 'تم تحديث الكشف' : 'The run was recalculated');
  for (const type of ['error', 'warning', 'info']) await expectCampusToast(page, toastOf(page, type), locale);
  await shootViewport(page, info, `toasts-stack-${tag}`);
  await dismissAll(page);

  // ── Loading, and a toast with an action button ──────────────────────────────
  await raise(page, 'loading', ar ? 'جارٍ إعداد ملف البنك…' : 'Preparing the bank file…');
  await raise(page, 'success', ar ? 'تم إلغاء الجزاء' : 'Penalty cancelled', {
    description: ar ? 'يمكنك التراجع خلال بضع ثوانٍ.' : 'You can undo this for a few seconds.',
    action: ar ? 'تراجع' : 'Undo',
  });
  await expectCampusToast(page, toastOf(page, 'loading'), locale, false);
  const withAction = toastOf(page, 'success');
  await expectCampusToast(page, withAction, locale);
  await expect(withAction.getByRole('button', { name: ar ? 'تراجع' : 'Undo' })).toBeVisible();
  await shootViewport(page, info, `toasts-loading-action-${tag}`);

  // The close button dismisses.
  await withAction.getByRole('button', { name: t(locale, 'ui.toast.close') }).click();
  await expect(withAction).toHaveCount(0);
  await dismissAll(page);
}

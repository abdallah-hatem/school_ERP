import { expect, test, type Locator, type Page } from '@playwright/test';
import { type Language, type LatenessMonth, type Month } from '@school-erp/shared';
import { Api } from './support/api';
import { currentMonth } from './support/dates';
import { t } from './support/i18n';
import { searchField, signIn } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/*
 * Live thousands grouping in a real browser (jsdom doesn't place the caret the way Chromium does):
 * commas appear while typing and the caret stays after the same digit. Nothing is saved.
 *
 * The caret is moved with the arrow keys, not Home/End: on macOS, Chromium treats Home/End as
 * "scroll the document" while the page is scrolled and leaves the caret where it is, in any input.
 */

function caret(input: Locator) {
  return input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]);
}

/** Moves the caret to `index` with ArrowLeft / ArrowRight, the way a person would. */
async function caretTo(page: Page, input: Locator, index: number) {
  const [at = 0] = await caret(input);
  const key = index < (at ?? 0) ? 'ArrowLeft' : 'ArrowRight';
  for (let i = 0; i < Math.abs(index - (at ?? 0)); i++) await page.keyboard.press(key);
  expect(await caret(input)).toEqual([index, index]);
}

for (const locale of ['en', 'ar'] as const satisfies readonly Language[]) {
  test(`number input (${locale}): salary groups live, caret kept on mid-insert and Backspace, blur adds .00`, async ({ page }) => {
    await signIn(page, locale);
    await page.goto(`/${locale}/employees/new`);
    const salary = page.getByRole('textbox', { name: t(locale, 'employees.fields.basicSalary') });
    await expect(salary).toHaveAttribute('dir', 'ltr');

    await salary.click();
    await page.keyboard.type('30000');
    await expect(salary).toHaveValue('30,000');
    expect(await caret(salary)).toEqual([6, 6]);

    // Caret between the 3 and the first 0, then a 5.
    await caretTo(page, salary, 1);
    await page.keyboard.type('5');
    await expect(salary).toHaveValue('350,000');
    expect(await caret(salary)).toEqual([2, 2]);

    // "350,|000" → Backspace removes the 0 before the comma: "35,000" with the caret after the 5.
    await caretTo(page, salary, 4);
    await page.keyboard.press('Backspace');
    await expect(salary).toHaveValue('35,000');
    expect(await caret(salary)).toEqual([2, 2]);

    await page.keyboard.press('Tab');
    await expect(salary).toHaveValue('35,000.00');

    // Clicking back in selects the whole figure, so typing replaces it.
    await salary.click();
    expect(await caret(salary)).toEqual([0, 9]);
    await page.keyboard.type('42000');
    await expect(salary).toHaveValue('42,000');

    // A second click on the focused field places the caret instead of selecting again.
    await salary.click({ position: { x: 8, y: 10 } });
    const [start, end] = await caret(salary);
    expect(start).toBe(end);
  });
}

test('number input: a lateness minutes field groups live and keeps the caret on a mid-insert', async ({ page }) => {
  // An open month: the payroll spec approves the current one, which locks its lateness.
  const api = await Api.asAdmin();
  let month: Month = currentMonth();
  let sheet = await api.get<LatenessMonth>('/hr/lateness', { month });
  for (let back = 1; sheet.locked && back <= 12; back++) {
    const [y = 0, m = 1] = currentMonth().split('-').map(Number);
    const d = new Date(y, m - 1 - back, 1);
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    sheet = await api.get<LatenessMonth>('/hr/lateness', { month });
  }
  const row = sheet.items[0];
  if (sheet.locked || !row) throw new Error('smoke: no open lateness month with rows');

  await signIn(page, 'en');
  await page.goto(`/en/lateness?month=${month}`);
  await searchField(page, t('en', 'lateness.search.label')).fill(row.employee.code);
  const input = page.getByRole('textbox', {
    name: t('en', 'lateness.minutesLabel', { name: row.employee.nameEn }),
    exact: true,
  });

  await input.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('1500');
  await expect(input).toHaveValue('1,500');

  await caretTo(page, input, 1);
  await page.keyboard.type('2');
  await expect(input).toHaveValue('12,500');
  expect(await caret(input)).toEqual([2, 2]);
});

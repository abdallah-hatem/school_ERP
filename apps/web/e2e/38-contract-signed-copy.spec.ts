import { expect, test } from '@playwright/test';
import { Api } from './support/api';
import { createContractEmployee } from './support/contracts';
import { signIn, shoot } from './support/ui';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/** A one-pixel PNG: a phone photo of one page, as far as the checks go. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const page1 = { name: 'page-1.png', mimeType: 'image/png', buffer: PNG };
const page2 = { name: 'page-2.png', mimeType: 'image/png', buffer: PNG };

/**
 * Runs in the `desktop-en` project. A contract's signed copy (owner, 2026-11-24), as a timeline: a
 * new employee's contract has none → "Upload signed copy" from the row's ⋯ adds two pages →
 * "Signed copy (2)" → the viewer shows them in order → one is removed with a reason → "Signed copy
 * (1)" → renewing with a page puts it on the new contract, the old one keeps its own.
 */
test('signed copy: uploaded from the row, viewed in order, a page removed with a reason, a renewal with its own copy', async ({ page }, info) => {
  test.setTimeout(150_000);
  const api = await Api.asAdmin();
  const employee = await createContractEmployee(api);
  await api.dispose();
  await signIn(page, 'en');
  const main = page.locator('main');

  await page.goto(`/en/employees/${employee.id}/contracts`);
  const history = main.getByRole('region', { name: `Contracts of ${employee.nameEn}` });
  await expect(history.getByText('No signed copy').filter({ visible: true }).first()).toBeVisible();

  // The row's ⋯ → "Upload signed copy": the viewer, empty, with "Add pages".
  await history.getByRole('button', { name: /^Actions for/ }).filter({ visible: true }).first().click();
  await page.getByRole('menuitem', { name: 'Upload signed copy' }).click();
  const viewer = page.getByRole('dialog', { name: 'Signed copy' });
  await expect(viewer.getByText('No signed copy yet')).toBeVisible();
  await viewer.locator('input[type=file]').setInputFiles([page1, page2]);
  const pages = viewer.getByTestId('signed-copy-page');
  await expect(pages).toHaveCount(2);
  await expect(pages.nth(0)).toContainText('page-1.png');
  await expect(pages.nth(1)).toContainText('page-2.png');
  await shoot(page, info, 'signed-copy-viewer');
  await viewer.getByRole('button', { name: 'Close' }).last().click();
  await expect(viewer).toBeHidden();
  await expect(history.getByTestId('signed-copy-count').filter({ visible: true }).first()).toHaveText('Signed copy (2)');

  // Reopened from the Documents column: the same two, in order; the first removed with a reason.
  await history.getByRole('button', { name: `Open the signed copy of ${employee.nameEn}` }).filter({ visible: true }).first().click();
  await expect(pages).toHaveCount(2);
  await pages.nth(0).getByRole('button', { name: 'Remove' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove page 1?' });
  await expect(confirm.getByRole('button', { name: 'Remove page' })).toBeDisabled();
  await confirm.getByRole('textbox').fill('Blurry photo');
  await confirm.getByRole('button', { name: 'Remove page' }).click();
  await expect(confirm).toBeHidden();
  await expect(pages).toHaveCount(1);
  await expect(pages.nth(0)).toContainText('page-2.png');
  await viewer.getByRole('button', { name: 'Close' }).last().click();
  await expect(history.getByTestId('signed-copy-count').filter({ visible: true }).first()).toHaveText('Signed copy (1)');

  // Renewed with a page: the new contract gets it; the old one keeps its own.
  await history.getByRole('button', { name: 'Renew', exact: true }).filter({ visible: true }).first().click();
  const renew = page.getByRole('dialog', { name: 'Renew this contract?' });
  await renew.locator('input[type=file]').setInputFiles([page1]);
  await expect(renew.getByTestId('pending-files')).toContainText('page-1.png');
  await renew.getByRole('button', { name: 'Renew', exact: true }).click();
  await expect(renew).toBeHidden();
  await expect(history.getByTestId('signed-copy-count').filter({ visible: true })).toHaveText(['Signed copy (1)', 'Signed copy (1)']);
  await shoot(page, info, 'signed-copy-after-renewal');
});

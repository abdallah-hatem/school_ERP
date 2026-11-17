import { screen, within, type BoundFunctions, type queries } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/*
 * Row actions live behind a ⋯ (`RowActions`): open it by its name, then pick an item by role. The
 * ⋯ is named "Actions for <row>" — matched as a prefix, so a penalty's "Mona Khalil · Late arrival"
 * is found by the employee's name.
 */
type Scope = BoundFunctions<typeof queries>;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The ⋯ of the row named `row` (English `Actions for …`, or a full RegExp for another locale). A
 * data table renders its rows twice (table and phone cards), so this is the first match.
 */
export function rowActionsButton(row: string | RegExp, scope: Scope = screen) {
  const name = typeof row === 'string' ? new RegExp(`^Actions for ${escape(row)}`) : row;
  return scope.getAllByRole('button', { name })[0]!;
}

/** Opens the row's menu and returns it. */
export async function openRowActions(user: UserEvent, row: string | RegExp, scope: Scope = screen) {
  await user.click(rowActionsButton(row, scope));
  return screen.findByRole('menu');
}

/** Opens the row's menu and picks `action` (a menu item's name). */
export async function chooseRowAction(
  user: UserEvent,
  row: string | RegExp,
  action: string | RegExp,
  scope: Scope = screen,
) {
  const menu = await openRowActions(user, row, scope);
  await user.click(within(menu).getByRole('menuitem', { name: action }));
}

/** The names of the items in an open menu, in order. */
export function menuItemNames(menu: HTMLElement) {
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.querySelector('[data-slot="row-action-label"]')?.textContent ?? item.textContent);
}

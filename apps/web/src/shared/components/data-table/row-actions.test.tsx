// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { CloseIcon, EditIcon, HideIcon, PayslipIcon, ShowIcon } from '@/shared/components/ui/icons';
import { renderWithI18n } from '@/test/render';
import { menuItemNames, openRowActions, rowActionsButton } from '@/test/row-actions';
import { DataTable } from './data-table';
import { RowActions, rowActionsColumn, type RowAction } from './row-actions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), redirect: vi.fn() }));

afterEach(cleanup);

interface Item {
  id: string;
  name: string;
  shown: boolean;
}

const actionsFor = (item: Item, on: Partial<Record<string, () => void>> = {}): RowAction[] => [
  // Listed out of order on purpose: destructive items still end up last.
  item.shown
    ? { id: 'hide', label: 'Hide', icon: HideIcon, destructive: true, onSelect: on.hide }
    : { id: 'show', label: 'Show', icon: ShowIcon, onSelect: on.show },
  { id: 'rename', label: 'Rename', icon: EditIcon, onSelect: on.rename },
  { id: 'payslip', label: 'Payslip', icon: PayslipIcon, href: `/en/items/${item.id}`, hidden: !item.shown },
];

describe('RowActions', () => {
  it('shows only the actions that apply, destructive ones last after a divider', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithI18n(
      <RowActions label="Actions for Science" actions={actionsFor({ id: 'd1', name: 'Science', shown: true })} />,
    );
    const menu = await openRowActions(user, 'Science');
    expect(menuItemNames(menu)).toEqual(['Rename', 'Payslip', 'Hide']);
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.hasAttribute('data-destructive'))).toEqual([false, false, true]);
    const separator = within(menu).getByRole('separator');
    expect(separator.compareDocumentPosition(items[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Payslip' }).getAttribute('href')).toBe('/en/items/d1');
    unmount();

    // A hidden item: Show is not destructive, Payslip doesn't apply — no divider either.
    renderWithI18n(
      <RowActions label="Actions for Science" actions={actionsFor({ id: 'd1', name: 'Science', shown: false })} />,
    );
    const hiddenMenu = await openRowActions(user, 'Science');
    expect(menuItemNames(hiddenMenu)).toEqual(['Show', 'Rename']);
    expect(within(hiddenMenu).queryByRole('separator')).toBeNull();
  });

  it('renders nothing when no action applies', () => {
    renderWithI18n(<RowActions label="Actions for X" actions={[{ id: 'a', label: 'A', icon: EditIcon, hidden: true }]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keyboard: Enter / Space / ArrowDown open, arrows move, Escape closes back on the ⋯, Enter runs an item', async () => {
    const user = userEvent.setup();
    const rename = vi.fn();
    renderWithI18n(
      <RowActions label="Actions for Science" actions={actionsFor({ id: 'd1', name: 'Science', shown: true }, { rename })} />,
    );
    const trigger = rowActionsButton('Science');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    for (const key of ['{Enter}', ' ', '{ArrowDown}']) {
      trigger.focus();
      await user.keyboard(key);
      const menu = await screen.findByRole('menu');
      await waitFor(() => expect(document.activeElement).toBe(within(menu).getAllByRole('menuitem')[0]));
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      expect(document.activeElement).toBe(trigger);
    }
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    await waitFor(() => expect(rename).toHaveBeenCalledTimes(1));
    expect(menu.isConnected).toBe(false);
  });

  it('a dialog opened from the menu returns focus to the ⋯ when it closes', async () => {
    const user = userEvent.setup();
    function Row() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <RowActions
            label="Actions for Mona Khalil"
            actions={[{ id: 'cancel', label: 'Cancel', icon: CloseIcon, destructive: true, onSelect: () => setOpen(true) }]}
          />
          <ConfirmDialog open={open} onOpenChange={setOpen} title="Cancel this penalty?" confirmLabel="Cancel penalty" onConfirm={() => true} />
        </>
      );
    }
    renderWithI18n(<Row />);
    const menu = await openRowActions(user, 'Mona Khalil');
    await user.click(within(menu).getByRole('menuitem', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel this penalty?' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(dialog.isConnected).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(rowActionsButton('Mona Khalil')));
  });

  it('busy: the ⋯ is disabled and cannot open', async () => {
    const user = userEvent.setup();
    renderWithI18n(<RowActions label="Actions for Science" busy actions={actionsFor({ id: 'd1', name: 'Science', shown: true })} />);
    const trigger = rowActionsButton('Science');
    expect(trigger).toHaveProperty('disabled', true);
    await user.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Arabic: named "إجراءات …", the menu follows the page direction', async () => {
    const user = userEvent.setup();
    function Arabic() {
      return <RowActions label="إجراءات العلوم" actions={actionsFor({ id: 'd1', name: 'العلوم', shown: true })} />;
    }
    renderWithI18n(<Arabic />, { locale: 'ar' });
    const menu = await openRowActions(user, /^إجراءات العلوم$/);
    expect(menu.getAttribute('dir')).toBe('rtl');
  });
});

describe('rowActionsColumn in a DataTable', () => {
  it('each row gets its own ⋯ in the table and in the top corner of its phone card', async () => {
    const user = userEvent.setup();
    const rows: Item[] = [
      { id: 'd1', name: 'Science', shown: true },
      { id: 'd2', name: 'Languages', shown: false },
    ];
    renderWithI18n(
      <DataTable
        label="Departments"
        rows={rows}
        getRowId={(r) => r.id}
        columns={[
          { id: 'name', header: 'Name', card: 'title', cell: (r) => r.name },
          rowActionsColumn<Item>('Actions', (r) => <RowActions label={`Actions for ${r.name}`} actions={actionsFor(r)} />),
        ]}
      />,
    );
    const table = within(document.querySelector<HTMLElement>('[data-view="table"]')!);
    const cards = within(document.querySelector<HTMLElement>('[data-view="cards"]')!);
    expect(table.getAllByRole('button', { name: /^Actions for/ })).toHaveLength(2);
    expect(cards.getAllByRole('button', { name: /^Actions for/ })).toHaveLength(2);
    expect(menuItemNames(await openRowActions(user, 'Languages', cards))).toEqual(['Show', 'Rename']);
  });
});

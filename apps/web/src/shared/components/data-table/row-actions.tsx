'use client';

import Link from 'next/link';
import { DropdownMenu as Menu } from 'radix-ui';
import { useRef, type ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
import { MoreIcon, type AppIcon } from '@/shared/components/ui/icons';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { formatCount } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import type { DataTableColumn } from './data-table';

/*
 * A row's actions behind one ⋯ button: a menu of icon + label items, the destructive ones (cancel,
 * retire, hide) in red at the bottom after a divider. Actions that don't apply to the row are
 * left out by the caller (`hidden`). An action that applies but can't run YET is shown disabled
 * with its reason under the label (`disabledReason`) — readable on a phone, unlike a tooltip
 * (a penalty waiting for an earlier one, §4). Radix gives the keyboard: Enter / Space
 * / ↓ open, arrows move, Escape closes and focus returns to the ⋯; it mirrors under `dir="rtl"`.
 */

export interface RowAction {
  /** Stable key. */
  id: string;
  label: string;
  icon: AppIcon;
  /** Runs once the menu has closed and focus is back on the ⋯ (so a dialog returns focus there). */
  onSelect?: () => void;
  /** A link instead of a handler (open, payslip). */
  href?: string;
  /** Red, after the divider: cancel, retire, hide. */
  destructive?: boolean;
  /** Green, with the regular items: gives something back (reactivate). */
  positive?: boolean;
  /** Left out of the menu — the action doesn't apply to this row. */
  hidden?: boolean;
  /** A small count after the label (adjustments recorded). */
  count?: number;
  /** Shown but not selectable, with this reason under the label: it applies, just not yet. */
  disabledReason?: string;
}

export function RowActions({
  label,
  actions,
  busy = false,
  disabled = false,
  className,
}: {
  /** The ⋯'s accessible name — "Actions for <row name>" (`ui.table.actionsFor`). */
  label: string;
  actions: RowAction[];
  /** A row action is mid-request: the ⋯ shows a spinner and can't open. */
  busy?: boolean;
  /** Another row's action is mid-request. */
  disabled?: boolean;
  className?: string;
}) {
  const { dir } = useTranslation();
  const pending = useRef<(() => void) | null>(null);
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;
  const regular = visible.filter((a) => !a.destructive);
  const destructive = visible.filter((a) => a.destructive);

  const item = (action: RowAction) => {
    const Icon = action.icon;
    const content = (
      <>
        <Icon className="size-5 shrink-0" />
        {action.disabledReason ? (
          <span className="flex min-w-0 flex-1 flex-col">
            <span data-slot="row-action-label" className="break-words">
              {action.label}
            </span>
            <span data-slot="row-action-reason" className="text-muted-foreground text-xs font-normal break-words">
              {action.disabledReason}
            </span>
          </span>
        ) : (
          <span data-slot="row-action-label" className="min-w-0 flex-1 break-words">
            {action.label}
          </span>
        )}
        {action.count ? (
          <span className="tabular bg-primary-soft text-primary grid min-w-5 place-items-center rounded-full px-1.5 text-xs">
            {formatCount(action.count)}
          </span>
        ) : null}
      </>
    );
    const itemClass = cn(
      'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold outline-none select-none',
      'data-[disabled]:cursor-not-allowed data-[disabled]:text-muted-foreground data-[disabled]:[&>svg]:opacity-60',
      action.destructive
        ? 'text-destructive-ink data-[highlighted]:bg-destructive-soft'
        : action.positive
          ? 'text-success-ink data-[highlighted]:bg-success-soft'
          : 'text-foreground data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary',
    );
    if (action.href) {
      return (
        <Menu.Item
          key={action.id}
          asChild
          className={itemClass}
          data-destructive={action.destructive || undefined}
          data-positive={action.positive || undefined}
        >
          <Link href={action.href}>{content}</Link>
        </Menu.Item>
      );
    }
    return (
      <Menu.Item
        data-destructive={action.destructive || undefined}
        data-positive={action.positive || undefined}
        key={action.id}
        className={itemClass}
        disabled={!!action.disabledReason}
        onSelect={() => {
          pending.current = action.onSelect ?? null;
        }}
      >
        {content}
      </Menu.Item>
    );
  };

  return (
    <Menu.Root dir={dir}>
      <Menu.Trigger asChild disabled={disabled || busy}>
        <Button
          variant="ghost"
          size="icon"
          loading={busy}
          aria-label={label}
          className={cn(
            'data-[state=open]:bg-muted data-[state=open]:text-foreground cursor-pointer pointer-fine:size-9',
            className,
          )}
        >
          {busy ? null : <MoreIcon className="size-5" />}
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          // Aligned to the ⋯'s end edge so it opens inward from the row's end; Radix mirrors `end` under RTL.
          align="end"
          sideOffset={6}
          collisionPadding={16}
          onCloseAutoFocus={() => {
            // Focus goes back to the ⋯ first; then the chosen action may open its dialog, which
            // will return focus to the ⋯ when it closes.
            const run = pending.current;
            pending.current = null;
            if (run) setTimeout(run, 0);
          }}
          className={cn(
            'border-border bg-popover text-popover-foreground shadow-raised z-(--z-popover) max-w-[calc(100vw-2rem)] min-w-48 overflow-y-auto rounded-xl border p-1.5',
            'scrollbar-clean max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin)',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          {regular.map(item)}
          {regular.length && destructive.length ? <Menu.Separator className="bg-border -mx-1.5 my-1.5 h-px" /> : null}
          {destructive.map(item)}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The ⋯ column's shape: a narrow end column; on a phone card the ⋯ sits in the top corner. */
export function rowActionsColumn<Row>(header: string, cell: (row: Row) => ReactNode): DataTableColumn<Row> {
  return {
    id: 'actions',
    header: <span className="sr-only">{header}</span>,
    cardLabel: header,
    align: 'end',
    className: 'w-16',
    card: 'menu',
    skeleton: <RowActionsSkeleton />,
    cell,
  };
}

/** The ⋯'s shape while a list loads. */
export function RowActionsSkeleton() {
  return <Skeleton className="ms-auto size-11 rounded-lg pointer-fine:size-9" />;
}

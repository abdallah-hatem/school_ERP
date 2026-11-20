'use client';

import type { NotificationCategory } from '@school-erp/shared';
import { Fragment, useId, type ReactNode } from 'react';
import { LockedIcon } from '@/shared/components/ui/icons';
import { Switch } from '@/shared/components/ui/switch';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { typeLook } from '../lib/type-look';

export interface TypeSwitchRow {
  type: string;
  module: string;
  category: NotificationCategory;
  checked: boolean;
  /** Required (can't be turned off): on, locked, "Required". */
  locked: boolean;
  disabled?: boolean;
  /** Its change is saving: shown at the new value, dimmed, not flippable until the save answers. */
  pending?: boolean;
  /** The line under the switch ("School default", "Reset to school default", "On by default"). */
  note?: ReactNode;
  /** Differs from the school's default (My account): the pill beside the name. */
  changed?: boolean;
  onChange: (next: boolean) => void;
}

/**
 * One switch per kind of notification (the in-app channel only — no other channel appears),
 * grouped by module and category ("HR · Waiting for you", "HR · Reminders"). A wide container
 * draws it as a two-column table; a narrow one (a phone) as one card per type. Shared by My account
 * → Notifications and Settings → Notifications.
 */
export function TypeSwitchList({
  rows,
  columnLabel,
  framed = true,
}: {
  rows: readonly TypeSwitchRow[];
  columnLabel: string;
  /** False inside another card (a Settings panel): an outline instead of a raised card. */
  framed?: boolean;
}) {
  const { t } = useTranslation();
  const groups = groupRows(rows);
  return (
    <div data-skeleton-block="notification-types" className="@container">
      {/* Wide: one card holding a table-like list. */}
      <div role="table" aria-label={t('notifications.title')} className={cn(
          'hidden overflow-hidden @min-[560px]:block',
          framed ? 'rounded-3xl bg-card shadow-card' : 'rounded-2xl border border-border bg-card',
        )}
      >
        <div role="rowgroup">
          <div role="row" className="grid grid-cols-[minmax(0,1fr)_13.75rem] border-b border-border bg-muted text-xs font-extrabold text-muted-foreground">
            <span role="columnheader" className="px-4 py-3 text-start">
              {t('notifications.preferences.notification')}
            </span>
            <span role="columnheader" className="px-4 py-3 text-center">
              {columnLabel}
            </span>
          </div>
        </div>
        {groups.map((group) => (
          <div role="rowgroup" key={group.key}>
            <div role="row" className="border-b border-border bg-background px-4 py-2.25 text-[0.78125rem] font-extrabold text-muted-foreground">
              <span role="cell">{groupLabel(group, t)}</span>
            </div>
            {group.rows.map((row) => (
              <div
                role="row"
                key={row.type}
                data-skeleton-each
                className="grid grid-cols-[minmax(0,1fr)_13.75rem] items-center border-b border-border last:border-b-0"
              >
                <span role="cell" className="flex min-w-0 items-center gap-3 px-4 py-3.5">
                  <TypeIcon type={row.type} size="md" />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      {t(`notifications.types.${row.type}.name`)}
                      {row.changed ? <ChangedPill /> : null}
                    </span>
                    <span className="text-[0.78125rem] text-muted-foreground">{t(`notifications.types.${row.type}.description`)}</span>
                  </span>
                </span>
                <span role="cell" className="flex justify-center px-4 py-3.5">
                  <RowSwitch row={row} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Narrow: a card per type under its group's heading. */}
      <div className="flex flex-col gap-2.5 @min-[560px]:hidden">
        {groups.map((group) => (
          <Fragment key={group.key}>
            <h3 className="flex items-center gap-2 px-1 pt-2 text-xs font-extrabold text-muted-foreground after:h-px after:flex-1 after:bg-border">
              {groupLabel(group, t)}
            </h3>
            {group.rows.map((row) => (
              <div
                key={row.type}
                data-skeleton-each
                className={cn('flex items-center gap-3 px-4 py-3.5', framed ? 'rounded-3xl bg-card shadow-card' : 'rounded-2xl bg-muted')}
              >
                <TypeIcon type={row.type} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-bold">{t(`notifications.types.${row.type}.name`)}</span>
                  <span className="text-xs text-muted-foreground">{t(`notifications.types.${row.type}.description`)}</span>
                  {row.changed ? (
                    <span className="mt-1.5">
                      <ChangedPill />
                    </span>
                  ) : null}
                </span>
                <RowSwitch row={row} align="end" />
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

interface Group {
  key: string;
  module: string;
  category: NotificationCategory;
  rows: TypeSwitchRow[];
}

function groupRows(rows: readonly TypeSwitchRow[]): Group[] {
  const groups: Group[] = [];
  // Approvals first, then reminders, each module's in the registry's order.
  const ordered = [...rows].sort((a, b) => (a.category === b.category ? 0 : a.category === 'approval' ? -1 : 1));
  for (const row of ordered) {
    const key = `${row.module}:${row.category}`;
    const found = groups.find((g) => g.key === key);
    if (found) found.rows.push(row);
    else groups.push({ key, module: row.module, category: row.category, rows: [row] });
  }
  return groups;
}

function groupLabel(group: Group, t: (key: string) => string): string {
  return `${t(`notifications.modules.${group.module}`)} · ${t(`notifications.preferences.groups.${group.category}`)}`;
}

function TypeIcon({ type, size }: { type: string; size: 'sm' | 'md' }) {
  const { icon: Icon, tone } = typeLook(type);
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center rounded-[0.6875rem]', tone, size === 'md' ? 'size-9 text-lg' : 'size-8.5 text-[1.0625rem]')}
    >
      <Icon />
    </span>
  );
}

function ChangedPill() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex rounded-full bg-accent-soft px-2.25 py-0.5 text-[0.71875rem] font-bold whitespace-nowrap text-accent-foreground">
      {t('notifications.preferences.changed')}
    </span>
  );
}

/**
 * The switch with its note under it; a required type's is on, locked and says "Required". In the
 * table it is centred under its column; on a card (`align="end"`) it keeps to the card's inline end,
 * so a long note ("Reset to school default") doesn't push the switch inward on that one row.
 */
function RowSwitch({ row, align = 'center' }: { row: TypeSwitchRow; align?: 'center' | 'end' }) {
  const { t } = useTranslation();
  const id = useId();
  const name = t(`notifications.types.${row.type}.name`);
  return (
    <span className={cn('flex shrink-0 flex-col gap-1', align === 'end' ? 'items-end' : 'items-center')}>
      <Switch
        id={id}
        aria-label={name}
        checked={row.locked ? true : row.checked}
        disabled={row.locked || row.disabled}
        pending={!row.locked && row.pending}
        aria-describedby={row.locked ? `${id}-req` : undefined}
        onCheckedChange={(next) => {
          if (!row.locked) row.onChange(next);
        }}
      />
      {row.locked ? (
        <small id={`${id}-req`} className="inline-flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
          <LockedIcon className="size-3" />
          {t('notifications.required')}
        </small>
      ) : row.note ? (
        <small className={cn('text-[0.6875rem] text-muted-foreground', align === 'end' ? 'text-end' : 'text-center')}>{row.note}</small>
      ) : null}
    </span>
  );
}

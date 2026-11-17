'use client';

import { SYSTEM_ADMIN_ROLE, type Role } from '@school-erp/shared';
import { useId, useState } from 'react';
import { SearchInput } from '@/shared/components/form/filter-controls';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { CustomRoleIcon, ErrorIcon, LockedIcon } from '@/shared/components/ui/icons';
import { formatCount } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { matchesSearch } from '@/shared/lib/search';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * The roles a user holds (P3, option A): a searchable checklist of cards, two across, each with
 * how many permissions the role grants. `lockedReason` locks the System admin box (checked) with
 * the reason under it — the last active System admin can't lose the role (R8, edge case 5).
 */
export function RoleChecklist({
  roles,
  value,
  onChange,
  lockedReason,
  disabled = false,
  labelledBy,
}: {
  roles: Role[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Set when the System admin role can't be taken away here. */
  lockedReason?: string | null;
  disabled?: boolean;
  /** The section heading naming the group. */
  labelledBy?: string;
}) {
  const { t, locale } = useTranslation();
  const [query, setQuery] = useState('');
  const idBase = useId();
  const shown = roles.filter((r) => matchesSearch(query, [r.nameEn, r.nameAr]));
  const chosen = new Set(value);

  function toggle(id: string, on: boolean) {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    // Keep the roles' own order, so the value is stable whatever order they were ticked in.
    onChange(roles.filter((r) => next.has(r.id)).map((r) => r.id));
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        aria-label={t('access.userForm.searchRoles')}
        placeholder={t('access.userForm.searchRoles')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        wrapperClassName="basis-auto"
      />
      <div role="group" aria-labelledby={labelledBy} className="grid gap-2 @min-[560px]:grid-cols-2">
        {shown.map((role) => {
          const id = `${idBase}-${role.id}`;
          const system = role.key === SYSTEM_ADMIN_ROLE;
          const locked = system && Boolean(lockedReason);
          const checked = chosen.has(role.id) || locked;
          return (
            <label
              key={role.id}
              htmlFor={id}
              data-role={role.key}
              className={cn(
                'flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors duration-150',
                'hover:border-primary/50',
                checked && 'border-primary/60 bg-primary-soft',
                locked && 'cursor-not-allowed border-dashed border-border bg-muted hover:border-border',
                disabled && 'cursor-not-allowed hover:border-border',
              )}
            >
              {locked ? (
                <span className="grid size-5 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                  <LockedIcon className="size-3.5" />
                </span>
              ) : null}
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled || locked}
                onCheckedChange={(v) => toggle(role.id, v === true)}
                className={cn('mt-0.5', locked && 'sr-only')}
                aria-describedby={locked ? `${id}-locked` : undefined}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
                  <span className="break-words">{localName(role, locale)}</span>
                  {!role.builtIn ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[0.7rem] font-bold text-info-ink">
                      <CustomRoleIcon className="size-3" />
                      {t('access.roles.custom')}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {system
                    ? t('access.roles.everyPermission')
                    : t('access.roles.permissionCount', { count: formatCount(role.permissions.length) })}
                </span>
                {locked ? (
                  <span id={`${id}-locked`} className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-warning-ink">
                    <ErrorIcon className="mt-px size-3.5 shrink-0" />
                    {lockedReason}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p role="status" className="rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          {t('access.userForm.noRoleMatches', { query: query.trim() })}
        </p>
      ) : null}
    </div>
  );
}

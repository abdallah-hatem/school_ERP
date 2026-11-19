'use client';

import {
  PERMISSION_SCOPES,
  isRowScoped,
  type PermissionKey,
  type PermissionModule,
  type PermissionScope,
} from '@school-erp/shared';
import { RadioGroup } from 'radix-ui';
import { useState } from 'react';
import { Switch } from '@/shared/components/ui/switch';
import { AccountingModuleIcon, CheckIcon, ChevronDownIcon, CoreModuleIcon, HrModuleIcon, type AppIcon } from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { isChanged, moduleGroups, type GrantMap } from '../lib/role-grants';

const MODULE_ICON: Record<PermissionModule, AppIcon> = {
  core: CoreModuleIcon,
  hr: HrModuleIcon,
  accounting: AccountingModuleIcon,
};

/**
 * A role's permissions grouped by module (P3, option A): a switch per permission with its label
 * and description, and — for the row-level ones — whose records it covers, inline. Whole-school
 * permissions say "Whole school". `readOnly` (the System admin) shows every permission locked on.
 * Each module folds open and shut like the penalty catalogue's groups. They start closed, except
 * a module with unsaved changes (it was opened to make them); "Turn all on/off" sits outside the
 * fold button, so it works on a closed module without opening it.
 */
export function PermissionGroups({
  value,
  saved,
  onToggle,
  onScope,
  onModule,
  readOnly = false,
}: {
  value: GrantMap;
  /** What is stored, so a changed row is highlighted. */
  saved: GrantMap;
  onToggle: (key: PermissionKey, on: boolean) => void;
  onScope: (key: PermissionKey, scope: PermissionScope) => void;
  onModule: (module: PermissionModule, on: boolean) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const groups = moduleGroups(value);
  const [open, setOpen] = useState<Set<PermissionModule>>(
    () => new Set(groups.filter(({ keys }) => keys.some((k) => isChanged(saved, value, k))).map((g) => g.module)),
  );
  function toggleOpen(module: PermissionModule) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }
  return (
    <div className="@container flex flex-col">
      {groups.map(({ module, keys, on }) => {
        const Icon = MODULE_ICON[module];
        const all = on === keys.length;
        const expanded = open.has(module);
        const panelId = `perm-module-${module}-panel`;
        return (
          <section key={module} aria-labelledby={`perm-module-${module}`} className="flex flex-col border-b border-border last:border-b-0">
            <div className={cn('flex items-center gap-3 px-5 py-3 md:px-6', expanded && 'border-b border-border bg-muted')}>
              <h3 className="flex min-w-0 flex-1">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => toggleOpen(module)}
                  className="tap-target flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-start"
                >
                  <ChevronDownIcon
                    className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-150', !expanded && '-rotate-90 rtl:rotate-90')}
                  />
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="size-4.5" />
                  </span>
                  <span id={`perm-module-${module}`} className="font-display text-base font-extrabold">
                    {t(`permissions.modules.${module}`)}
                  </span>
                  <span className="tabular text-xs font-semibold text-muted-foreground">
                    {t('access.roleForm.groupCount', { on, total: keys.length })}
                  </span>
                </button>
              </h3>
              {readOnly ? null : (
                <button
                  type="button"
                  onClick={() => onModule(module, !all)}
                  className="tap-target shrink-0 cursor-pointer rounded-md text-sm font-bold text-primary hover:underline"
                >
                  {all ? t('access.roleForm.turnAllOff') : t('access.roleForm.turnAllOn')}
                </button>
              )}
            </div>
            {expanded ? (
              <ul id={panelId} className="flex flex-col">
                {keys.map((key) => (
                  <PermissionRow
                    key={key}
                    permission={key}
                    scope={value[key]}
                    changed={isChanged(saved, value, key)}
                    readOnly={readOnly}
                    onToggle={onToggle}
                    onScope={onScope}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function PermissionRow({
  permission,
  scope,
  changed,
  readOnly,
  onToggle,
  onScope,
}: {
  permission: PermissionKey;
  scope: PermissionScope | undefined;
  changed: boolean;
  readOnly: boolean;
  onToggle: (key: PermissionKey, on: boolean) => void;
  onScope: (key: PermissionKey, scope: PermissionScope) => void;
}) {
  const { t } = useTranslation();
  const on = Boolean(scope);
  const label = t(`permissions.keys.${permission}.label`);
  const id = `perm-${permission.replace(/\./g, '-')}`;
  return (
    <li
      data-permission={permission}
      data-changed={changed || undefined}
      className={cn(
        'flex flex-col gap-3 border-b border-dashed border-border px-5 py-3 last:border-b-0 md:px-6',
        '@min-[720px]:flex-row @min-[720px]:items-center @min-[720px]:gap-4',
        changed && 'bg-warning-soft/70',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        {readOnly ? (
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
            <CheckIcon weight="bold" className="size-3.5" />
            <span className="sr-only">{label}</span>
          </span>
        ) : (
          <Switch
            id={id}
            checked={on}
            onCheckedChange={(v) => onToggle(permission, v)}
            aria-describedby={`${id}-desc`}
            className="mt-0.5"
          />
        )}
        <label htmlFor={readOnly ? undefined : id} className={cn('flex min-w-0 flex-col', !readOnly && 'cursor-pointer')}>
          <span className={cn('text-sm', on ? 'font-bold' : 'font-semibold text-foreground/85')}>{label}</span>
          <span id={`${id}-desc`} className="text-xs text-muted-foreground">
            {t(`permissions.keys.${permission}.description`)}
          </span>
        </label>
      </div>
      {/* On a narrow card only a scope that is in use is shown (under its row), like the mockup. */}
      <div
        className={cn(
          'ps-15 @min-[720px]:block @min-[720px]:ps-0',
          (readOnly || !isRowScoped(permission) || !on) && 'hidden',
        )}
      >
        {readOnly || !isRowScoped(permission) ? (
          <span className="text-xs text-muted-foreground">
            {readOnly ? t('permissions.scopes.all') : t('access.roleForm.wholeSchool')}
          </span>
        ) : (
          <ScopeControl
            label={t('access.roleForm.scopeLabel', { permission: label })}
            value={scope ?? 'all'}
            disabled={!on}
            onChange={(s) => onScope(permission, s)}
          />
        )}
      </div>
    </li>
  );
}

/** Whose records a permission covers: Everyone / Their stage / Their team / Themselves only. */
function ScopeControl({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: PermissionScope;
  disabled: boolean;
  onChange: (scope: PermissionScope) => void;
}) {
  const { t, dir } = useTranslation();
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      disabled={disabled}
      dir={dir}
      orientation="horizontal"
      onValueChange={(v) => onChange(v as PermissionScope)}
      className={cn(
        'grid grid-cols-2 gap-0.5 rounded-xl bg-muted p-1 @min-[420px]:grid-cols-4',
        disabled && 'opacity-55',
      )}
    >
      {PERMISSION_SCOPES.map((s) => (
        <RadioGroup.Item
          key={s}
          value={s}
          className={cn(
            'min-h-9 cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-150',
            'hover:text-foreground data-[state=checked]:bg-card data-[state=checked]:text-primary data-[state=checked]:shadow-xs',
            'focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring/55',
            'disabled:cursor-not-allowed disabled:hover:text-muted-foreground',
          )}
        >
          {t(`permissions.scopes.${s}`)}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

'use client';

import { useEffect, useId } from 'react';
import { useController, useWatch, type Control } from 'react-hook-form';
import { FieldShell } from '@/shared/components/form/field-shell';
import { Combobox } from '@/shared/components/ui/combobox';
import { CloseIcon, StageIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_STAGES } from '../apis';
import type { EmployeeFormValues, OtherStageChoice } from '../lib/employee-form';
import { useListItemOptions } from '../lib/list-item-options';

/**
 * "Also teaches in" (§3, owner 2026-11-21): the employee's stages besides the main one, as removable
 * tags, and a picker that adds one. The API searches the stages and leaves out the main stage and
 * the ones already listed (`excludeIds`), so neither is offered. Choosing as main stage one that is
 * already listed here drops it from the list. The form's rules (and the API) still refuse the main
 * stage among them.
 */
export function OtherStagesField({
  control,
  disabled,
}: {
  control: Control<EmployeeFormValues>;
  disabled?: boolean;
}) {
  const { t, locale } = useTranslation();
  const id = useId();
  const { field, fieldState } = useController({ control, name: 'otherStages' });
  const chosen = (field.value ?? []) as OtherStageChoice[];
  const mainStageId = useWatch({ control, name: 'stageId' });
  const excludeIds = [...(mainStageId ? [mainStageId] : []), ...chosen.map((s) => s.id)];
  const server = useListItemOptions(GET_STAGES, locale, { excludeIds });

  // The main stage just became one of these: it is the main one now, so it leaves this list.
  const { onChange } = field;
  useEffect(() => {
    if (mainStageId && chosen.some((s) => s.id === mainStageId)) {
      onChange(chosen.filter((s) => s.id !== mainStageId));
    }
  }, [mainStageId, chosen, onChange]);

  function add(value: string) {
    if (!value || value === mainStageId || chosen.some((s) => s.id === value)) return;
    const label = server.options.find((o) => o.value === value)?.label ?? value;
    field.onChange([...chosen, { id: value, label }]);
  }

  function remove(value: string) {
    field.onChange(chosen.filter((s) => s.id !== value));
  }

  return (
    <FieldShell
      id={id}
      label={t('employees.fields.otherStages')}
      hint={t('employees.hints.otherStages')}
      error={fieldState.error?.message ?? (fieldState.error as { root?: { message?: string } } | undefined)?.root?.message}
      className="sm:col-span-2"
    >
      {(a11y) => (
        <div className="flex flex-col gap-2.5">
          {chosen.length > 0 ? (
            <ul aria-label={t('employees.fields.otherStages')} className="flex flex-wrap gap-2" data-testid="other-stages">
              {chosen.map((s) => (
                <li
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-info-soft py-1 ps-3 pe-1 text-sm font-semibold text-info-ink"
                >
                  <StageIcon className="size-4 shrink-0" />
                  <span>{s.label}</span>
                  <button
                    type="button"
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-card/70 disabled:cursor-not-allowed"
                    aria-label={t('employees.otherStages.remove', { stage: s.label })}
                    onClick={() => remove(s.id)}
                    disabled={disabled}
                  >
                    <CloseIcon className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Combobox
            {...a11y}
            server={server}
            value=""
            onValueChange={add}
            onClose={field.onBlur}
            disabled={disabled}
            placeholder={t('employees.otherStages.add')}
            searchPlaceholder={t('employees.otherStages.search')}
            emptyText={t('employees.noStages')}
            noMatchesText={t('ui.form.noMatches')}
          />
        </div>
      )}
    </FieldShell>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  MAX_VIOLATION_LEVELS,
  MIN_VIOLATION_LEVELS,
  PENALTY_ACTIONS,
  PENALTY_ACTIONS_ALLOWING_DAYS,
  PENALTY_ACTIONS_REQUIRING_DAYS,
  type Violation,
} from '@school-erp/shared';
import { useId, useRef, type ReactNode } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { NumberField, SelectField, SwitchField, TextareaField, TextField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { AddIcon, RemoveIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { NAME_MAX, NOTE_MAX, violationSchema, type ViolationFormValues } from '../schemas';

function toForm(v: Violation | null): ViolationFormValues {
  if (!v) return { nameEn: '', nameAr: '', note: '', oncePerDay: true, levels: [{ action: 'NOTICE', days: null }] };
  return {
    nameEn: v.nameEn,
    nameAr: v.nameAr,
    note: v.note ?? '',
    oncePerDay: v.oncePerDay,
    levels: [...v.levels].sort((a, b) => a.level - b.level).map((l) => ({ action: l.action, days: l.days })),
  };
}

/**
 * Add or edit a violation: names, note, the "Once per day" switch (§4) and its 1–5 levels (action + days). Validated live with the
 * shared `levelDaysProblem` / `violationLevelsProblem` rules. `onSubmit` resolves `true` to close.
 */
export function ViolationDialog({
  violation,
  title,
  description,
  onClose,
  onSubmit,
}: {
  violation: Violation | null;
  title: string;
  /** Under the title, e.g. the name of the violation being edited. */
  description?: ReactNode;
  onClose: () => void;
  onSubmit: (values: ViolationFormValues) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const busy = useRef(false);
  const form = useForm<ViolationFormValues>({
    resolver: zodResolver(violationSchema),
    mode: 'onChange',
    defaultValues: toForm(violation),
  });
  const { isDirty, isValid, isSubmitting, errors } = form.formState;
  const levels = useFieldArray({ control: form.control, name: 'levels' });
  const actions = useWatch({ control: form.control, name: 'levels' });
  const levelsError = errors.levels?.root?.message ?? errors.levels?.message;

  async function submit(values: ViolationFormValues) {
    if (busy.current) return;
    busy.current = true;
    try {
      if (await onSubmit(values)) onClose();
    } finally {
      busy.current = false;
    }
  }

  const actionOptions = PENALTY_ACTIONS.map((a) => ({ value: a, label: t(`common.enums.penaltyAction.${a}`) }));

  return (
    <Dialog open onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent
        size="lg"
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={isSubmitting}>
                {t('common.actions.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" form={formId} variant="primary" disabled={!isDirty || !isValid} loading={isSubmitting}>
              {violation ? t('common.actions.save') : t('common.actions.create')}
            </Button>
          </>
        }
      >
        <Form id={formId} onSubmit={(e) => void form.handleSubmit(submit)(e)}>
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              control={form.control}
              name="nameEn"
              label={t('settings.names.nameEn')}
              placeholder={t('settings.catalogue.violationPlaceholderEn')}
              maxLength={NAME_MAX.violation}
              dir="ltr"
              required
            />
            <TextField
              control={form.control}
              name="nameAr"
              label={t('settings.names.nameAr')}
              placeholder={t('settings.catalogue.violationPlaceholderAr')}
              maxLength={NAME_MAX.violation}
              dir="rtl"
              required
            />
          </div>
          <TextareaField
            control={form.control}
            name="note"
            label={t('settings.catalogue.note')}
            hint={t('settings.catalogue.noteHint')}
            placeholder={t('settings.catalogue.notePlaceholder')}
            maxLength={NOTE_MAX}
            rows={3}
          />
          <SwitchField
            control={form.control}
            name="oncePerDay"
            label={t('settings.catalogue.oncePerDay')}
            hint={t('settings.catalogue.oncePerDayHint')}
          />

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-semibold">{t('settings.catalogue.levels')}</legend>
            <p className="text-xs text-muted-foreground">
              {t('settings.catalogue.levelsHint', { min: MIN_VIOLATION_LEVELS, max: MAX_VIOLATION_LEVELS })}
            </p>
            <ol className="flex flex-col gap-3">
              {levels.fields.map((row, i) => {
                const action = actions?.[i]?.action ?? row.action;
                const allowsDays = PENALTY_ACTIONS_ALLOWING_DAYS.includes(action);
                const needsDays = PENALTY_ACTIONS_REQUIRING_DAYS.includes(action);
                return (
                  <li key={row.id} className="flex flex-col gap-3 rounded-2xl bg-muted p-3 sm:flex-row sm:items-start">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-sm font-bold sm:mt-7">
                      <bdi className="tabular">{i + 1}</bdi>
                    </span>
                    <SelectField
                      control={form.control}
                      name={`levels.${i}.action`}
                      label={t('settings.catalogue.levelAction', { level: i + 1 })}
                      options={actionOptions}
                      required
                      className="flex-1"
                    />
                    <NumberField
                      control={form.control}
                      name={`levels.${i}.days`}
                      label={t('settings.catalogue.levelDays', { level: i + 1 })}
                      hint={needsDays ? undefined : allowsDays ? t('settings.catalogue.daysOptional') : t('settings.catalogue.daysNone')}
                      placeholder={t('settings.hrRules.daysPlaceholder')}
                      suffix={t('ui.units.days')}
                      decimals={2}
                      disabled={!allowsDays}
                      required={needsDays}
                      className="sm:w-48"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="self-end sm:mt-7 sm:self-start"
                      aria-label={t('settings.catalogue.removeLevel', { level: i + 1 })}
                      disabled={levels.fields.length <= MIN_VIOLATION_LEVELS}
                      onClick={() => levels.remove(i)}
                    >
                      <RemoveIcon />
                    </Button>
                  </li>
                );
              })}
            </ol>
            {levelsError ? <p className="text-xs font-semibold text-destructive-ink">{t(levelsError)}</p> : null}
            <div>
              <Button
                variant="soft"
                size="sm"
                disabled={levels.fields.length >= MAX_VIOLATION_LEVELS}
                onClick={() => levels.append({ action: 'DEDUCT_DAYS', days: null })}
              >
                <AddIcon />
                {t('settings.catalogue.addLevel')}
              </Button>
            </div>
          </fieldset>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

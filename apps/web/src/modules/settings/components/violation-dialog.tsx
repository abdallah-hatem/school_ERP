'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  levelNumberKind,
  MAX_VIOLATION_LEVELS,
  MIN_VIOLATION_LEVELS,
  PenaltyEffect,
  PenaltySalaryBase,
  settingsHref,
  type PenaltyActionItem,
  type PenaltyActionRef,
  type Violation,
} from '@school-erp/shared';
import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { useCan } from '@/core/auth';
import { MoneyField, NumberField, SelectField, SwitchField, TextareaField, TextField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { AddIcon, RemoveIcon } from '@/shared/components/ui/icons';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { NAME_MAX, NOTE_MAX, violationSchema, type EffectOf, type ViolationFormValues } from '../schemas';

/** An action the level editor can show: today's, and whether it is hidden. */
type ActionChoice = PenaltyActionRef & { isActive: boolean };

/** A level's stored number → the form's one number field. */
function valueOf(level: Violation['levels'][number]): number | null {
  return level.days ?? level.percent ?? level.amount ?? null;
}

function toForm(v: Violation | null, firstActionId: string): ViolationFormValues {
  if (!v) return { nameEn: '', nameAr: '', note: '', oncePerDay: true, levels: [{ actionId: firstActionId, value: null }] };
  return {
    nameEn: v.nameEn,
    nameAr: v.nameAr,
    note: v.note ?? '',
    oncePerDay: v.oncePerDay,
    levels: [...v.levels].sort((a, b) => a.level - b.level).map((l) => ({ actionId: l.action.id, value: valueOf(l) })),
  };
}

/**
 * The actions a level may name here: the visible list as the API sent it, in its order, then any
 * hidden one this violation's levels already hold (they keep it — spec 2026-11-25). By id.
 */
function actionChoices(actions: readonly PenaltyActionItem[], violation: Violation | null): Map<string, ActionChoice> {
  const byId = new Map<string, ActionChoice>(actions.map((a) => [a.id, a]));
  for (const l of violation?.levels ?? []) if (!byId.has(l.action.id)) byId.set(l.action.id, l.action);
  return byId;
}

/**
 * Add or edit a violation: names, note, the "Once per day" switch (§4) and its 1–5 levels — each an
 * action from the school's Penalty actions and the one number its effect asks for (spec 2026-11-25):
 * days, a percent, an amount (the shared `MoneyField`), or none. Validated live with the shared
 * rules. `actions`: the visible list (the picker); `onManageActions` closes this and goes to the
 * Penalty actions card. `onSubmit` resolves `true` to close.
 */
export function ViolationDialog({
  violation,
  actions,
  title,
  description,
  onClose,
  onSubmit,
  onManageActions,
}: {
  violation: Violation | null;
  actions: readonly PenaltyActionItem[];
  title: string;
  /** Under the title, e.g. the name of the violation being edited. */
  description?: ReactNode;
  onClose: () => void;
  onSubmit: (values: ViolationFormValues, effectOf: EffectOf) => Promise<boolean>;
  onManageActions?: () => void;
}) {
  const { t, locale } = useTranslation();
  const canManage = useCan()('hr.penalty_catalogue.manage');
  const formId = useId();
  const busy = useRef(false);
  const choices = useMemo(() => actionChoices(actions, violation), [actions, violation]);
  // Read by the schema at validation time, so it always sees the actions on screen.
  const choicesRef = useRef(choices);
  useEffect(() => {
    choicesRef.current = choices;
  }, [choices]);
  const effectOf: EffectOf = useCallback((id) => choices.get(id)?.effect, [choices]);
  const [schema] = useState(() => violationSchema((id) => choicesRef.current.get(id)?.effect));
  const form = useForm<ViolationFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: toForm(violation, actions[0]?.id ?? ''),
  });
  const { isDirty, isValid, isSubmitting, errors } = form.formState;
  const levels = useFieldArray({ control: form.control, name: 'levels' });
  const rows = useWatch({ control: form.control, name: 'levels' });
  const levelsError = errors.levels?.root?.message ?? errors.levels?.message;

  // Switching a level's action keeps its number only when the unit stays the same (days → days);
  // otherwise it is cleared, so 10 days never becomes 10% (spec 2026-11-25).
  useEffect(() => {
    const unitOf = (id: string | undefined) => {
      const effect = id ? choicesRef.current.get(id)?.effect : undefined;
      return effect ? levelNumberKind(effect) : null;
    };
    let seen = form.getValues('levels').map((l) => l.actionId);
    const sub = form.watch((values, { name }) => {
      const now = (values.levels ?? []).map((l) => l?.actionId ?? '');
      const changed = name ? /^levels\.(\d+)\.actionId$/.exec(name) : null;
      if (changed) {
        const i = Number(changed[1]);
        if (unitOf(seen[i]) !== unitOf(now[i])) form.setValue(`levels.${i}.value`, null, { shouldValidate: true, shouldDirty: true });
      }
      seen = now;
    });
    return () => sub.unsubscribe();
  }, [form]);

  async function submit(values: ViolationFormValues) {
    if (busy.current) return;
    busy.current = true;
    try {
      if (await onSubmit(values, effectOf)) onClose();
    } finally {
      busy.current = false;
    }
  }

  const hiddenMark = t('settings.catalogue.hiddenMarker');
  const options = [...choices.values()].map((a) => ({
    value: a.id,
    label: a.isActive ? nameIn(a, locale) : `${nameIn(a, locale)} ${hiddenMark}`,
  }));
  const defaultActionId = actions[0]?.id ?? '';

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
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <legend className="text-sm font-semibold">{t('settings.catalogue.levels')}</legend>
              {canManage && onManageActions ? (
                <Link
                  href={settingsHref(locale, 'catalogue', 'actions')}
                  className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    onManageActions();
                  }}
                >
                  {t('settings.catalogue.manageActions')}
                </Link>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.catalogue.levelsHint', { count: MAX_VIOLATION_LEVELS, min: MIN_VIOLATION_LEVELS, max: MAX_VIOLATION_LEVELS })}
            </p>
            <ol className="flex flex-col gap-3">
              {levels.fields.map((row, i) => (
                <li key={row.id} className="flex flex-col gap-3 rounded-2xl bg-muted p-3 sm:flex-row sm:items-start">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-sm font-bold sm:mt-7">
                    <bdi className="tabular">{i + 1}</bdi>
                  </span>
                  <ActionSelect form={form} index={i} options={options} />
                  <LevelNumberField form={form} index={i} action={choices.get(rows?.[i]?.actionId ?? row.actionId)} />
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
              ))}
            </ol>
            {levelsError ? <p className="text-xs font-semibold text-destructive-ink">{t(levelsError)}</p> : null}
            <div>
              <Button
                variant="soft"
                size="sm"
                disabled={levels.fields.length >= MAX_VIOLATION_LEVELS}
                onClick={() => levels.append({ actionId: defaultActionId, value: null })}
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

/**
 * A level's action. Switching it keeps the typed number only when the unit stays the same (days →
 * days); otherwise the number is cleared, so 10 days never becomes 10% (spec 2026-11-25).
 */
function ActionSelect({
  form,
  index,
  options,
}: {
  form: UseFormReturn<ViolationFormValues>;
  index: number;
  options: { value: string; label: string }[];
}) {
  const { t } = useTranslation();
  return (
    <SelectField
      control={form.control}
      name={`levels.${index}.actionId`}
      label={t('settings.catalogue.levelAction', { level: index + 1 })}
      options={options}
      required
      className="flex-1"
    />
  );
}

/**
 * The level's one number, in the unit of its action's effect: Days (suffix "days"), Percent (suffix
 * "%", hint "of the salary for the month" / "of the basic salary"), Amount (the shared `MoneyField`),
 * or disabled with "No number" for Record only; "Optional" for an investigation.
 */
function LevelNumberField({
  form,
  index,
  action,
}: {
  form: UseFormReturn<ViolationFormValues>;
  index: number;
  action: ActionChoice | undefined;
}) {
  const { t } = useTranslation();
  const level = index + 1;
  const name = `levels.${index}.value` as const;
  const effect = action?.effect;
  if (effect === PenaltyEffect.DEDUCT_AMOUNT) {
    return (
      <MoneyField
        control={form.control}
        name={name}
        label={t('settings.catalogue.levelAmount', { level })}
        placeholder="0.00"
        required
        className="sm:w-48"
      />
    );
  }
  if (effect === PenaltyEffect.DEDUCT_PERCENT) {
    return (
      <NumberField
        control={form.control}
        name={name}
        label={t('settings.catalogue.levelPercent', { level })}
        hint={
          action?.percentBase === PenaltySalaryBase.BASIC_SALARY
            ? t('settings.catalogue.percentOfBasic')
            : t('settings.catalogue.percentOfMonth')
        }
        placeholder="10"
        suffix="%"
        decimals={2}
        required
        className="sm:w-48"
      />
    );
  }
  const takesDays = effect === PenaltyEffect.DEDUCT_DAYS || effect === PenaltyEffect.INVESTIGATION;
  return (
    <NumberField
      control={form.control}
      name={name}
      label={t('settings.catalogue.levelDays', { level })}
      hint={
        effect === PenaltyEffect.DEDUCT_DAYS
          ? undefined
          : effect === PenaltyEffect.INVESTIGATION
            ? t('settings.catalogue.optional')
            : t('settings.catalogue.noNumber')
      }
      placeholder={t('settings.hrRules.daysPlaceholder')}
      suffix={t('ui.units.days')}
      decimals={2}
      disabled={!takesDays}
      required={effect === PenaltyEffect.DEDUCT_DAYS}
      className="sm:w-48"
    />
  );
}

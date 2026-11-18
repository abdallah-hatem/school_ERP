'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  HrSettingKey,
  isValidDays,
  latenessDays,
  PART_TIME_WORK_SYSTEMS,
  REPETITION_WINDOWS,
  SETTING_DEFAULTS,
  SETTING_LIMITS,
  type HrSettings,
  type LatenessRule,
  type UpdateHrSettingsRequest,
} from '@school-erp/shared';
import { useId, useRef, useState } from 'react';
import { Can } from '@/core/auth';
import { useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import { callApi } from '@/lib/callApi';
import { NumberField, SelectField } from '@/shared/components/form/fields';
import { SkeletonMask } from '@/shared/components/ui/skeleton';
import { Form } from '@/shared/components/form/form';
import { ErrorState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { AddIcon, RemoveIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { formatCount, formatDayCount } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_HR_SETTINGS, UPDATE_HR_SETTINGS } from '../apis';
import { useReportDirty } from '../hooks/unsaved-changes';
import { useResource } from '../hooks/use-resource';
import { hrRulesSchema, type HrRulesFormValues } from '../schemas';
import { SaveBar, SectionPanel } from './section-panel';

const PLACEHOLDER: HrSettings = {
  lateness: {
    graceMinutes: SETTING_DEFAULTS[HrSettingKey.LATENESS_GRACE_MINUTES],
    steps: SETTING_DEFAULTS[HrSettingKey.LATENESS_STEPS],
    extraHourDays: SETTING_DEFAULTS[HrSettingKey.LATENESS_EXTRA_HOUR_DAYS],
  },
  payroll: {
    dayDivisor: SETTING_DEFAULTS[HrSettingKey.PAYROLL_DAY_DIVISOR],
    partTime: SETTING_DEFAULTS[HrSettingKey.PAYROLL_PART_TIME],
  },
  penalties: { repetitionWindow: SETTING_DEFAULTS[HrSettingKey.PENALTIES_REPETITION_WINDOW] },
};

/** Hours of a month's maximum minutes (6,000 → 100) — the API's cap on steps. */
const MAX_STEPS = Math.ceil(SETTING_LIMITS.latenessMinutesMax / 60);

function toForm(s: HrSettings): HrRulesFormValues {
  return {
    graceMinutes: s.lateness.graceMinutes,
    steps: [...s.lateness.steps].sort((a, b) => a.hour - b.hour).map((step) => ({ days: step.days })),
    extraHourDays: s.lateness.extraHourDays,
    dayDivisor: s.payroll.dayDivisor,
    partTime: { ...s.payroll.partTime },
    repetitionWindow: s.penalties.repetitionWindow,
  };
}

/** Form rows → the rule `latenessDays` takes, or null while a value is missing or invalid. */
export function ruleFromForm(values: {
  graceMinutes: number | null | undefined;
  steps: { days: number | null | undefined }[] | undefined;
  extraHourDays: number | null | undefined;
}): LatenessRule | null {
  const { graceMinutes, steps, extraHourDays } = values;
  if (graceMinutes == null || !Number.isInteger(graceMinutes) || graceMinutes < 0) return null;
  if (extraHourDays == null || !isValidDays(extraHourDays)) return null;
  if (!steps?.length || steps.some((s) => s.days == null || !isValidDays(s.days))) return null;
  return {
    graceMinutes,
    steps: steps.map((s, i) => ({ hour: i + 1, days: s.days as number })),
    extraHourDays,
  };
}

/** Lateness rule, payroll rule and the penalty repetition window (§5, §6, §7). */
export function HrRulesSection() {
  const { t } = useTranslation();
  const settings = useResource('hr-settings', () => GET_HR_SETTINGS());

  if (settings.error) {
    return (
      <SectionPanel title={t('settings.sections.hrRules.title')}>
        <ErrorState onRetry={settings.retry} retrying={settings.retrying} />
      </SectionPanel>
    );
  }
  if (!settings.data) {
    // The form itself as its skeleton (the §7 defaults as placeholders): every field in place.
    return (
      <SkeletonMask>
        <HrRulesForm initial={PLACEHOLDER} onSaved={() => undefined} />
      </SkeletonMask>
    );
  }
  return <HrRulesForm initial={settings.data} onSaved={(next) => settings.setData(() => next)} />;
}

function HrRulesForm({ initial, onSaved }: { initial: HrSettings; onSaved: (next: HrSettings) => void }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const form = useForm<HrRulesFormValues>({
    resolver: zodResolver(hrRulesSchema),
    mode: 'onChange',
    defaultValues: toForm(initial),
  });
  const { isDirty, isValid, isSubmitting, dirtyFields } = form.formState;
  const steps = useFieldArray({ control: form.control, name: 'steps' });
  useReportDirty('hr-rules', isDirty);

  async function save(values: HrRulesFormValues) {
    if (busy.current) return;
    busy.current = true;
    try {
      // Only the keys that changed: each changed key writes one history row (§7).
      const body: UpdateHrSettingsRequest = {};
      const lateness: NonNullable<UpdateHrSettingsRequest['lateness']> = {};
      if (dirtyFields.graceMinutes) lateness.graceMinutes = values.graceMinutes;
      if (dirtyFields.steps) lateness.steps = values.steps.map((s, i) => ({ hour: i + 1, days: s.days }));
      if (dirtyFields.extraHourDays) lateness.extraHourDays = values.extraHourDays;
      if (Object.keys(lateness).length) body.lateness = lateness;
      const payroll: NonNullable<UpdateHrSettingsRequest['payroll']> = {};
      if (dirtyFields.dayDivisor) payroll.dayDivisor = values.dayDivisor;
      if (dirtyFields.partTime) payroll.partTime = values.partTime;
      if (Object.keys(payroll).length) body.payroll = payroll;
      if (dirtyFields.repetitionWindow) body.penalties = { repetitionWindow: values.repetitionWindow };

      const res = await callApi(UPDATE_HR_SETTINGS(body));
      if (res.success && res.data) {
        form.reset(toForm(res.data));
        setSaved(true);
        onSaved(res.data);
      }
    } finally {
      busy.current = false;
    }
  }

  const stepsError = form.formState.errors.steps?.root?.message ?? form.formState.errors.steps?.message;

  return (
    <Form
      onSubmit={(e) => {
        setSaved(false);
        void form.handleSubmit(save)(e);
      }}
      className="gap-6"
    >
      <SectionPanel title={t('settings.hrRules.lateness.title')} description={t('settings.hrRules.lateness.description')}>
        <div className="grid gap-5 md:grid-cols-2">
          <NumberField
            control={form.control}
            name="graceMinutes"
            label={t('settings.hrRules.lateness.grace')}
            hint={t('settings.hrRules.lateness.graceHint')}
            placeholder={t('settings.hrRules.lateness.gracePlaceholder')}
            suffix={t('settings.units.minutes')}
            required
          />
          <NumberField
            control={form.control}
            name="extraHourDays"
            label={t('settings.hrRules.lateness.extra')}
            hint={t('settings.hrRules.lateness.extraHint')}
            placeholder={t('settings.hrRules.daysPlaceholder')}
            suffix={t('ui.units.days')}
            decimals={2}
            required
          />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">{t('settings.hrRules.lateness.steps')}</legend>
          <p className="text-xs text-muted-foreground">{t('settings.hrRules.lateness.stepsHint')}</p>
          <ol className="flex flex-col gap-3">
            {steps.fields.map((step, i) => (
              <li key={step.id} className="flex items-start gap-3 rounded-2xl bg-muted p-3">
                <NumberField
                  control={form.control}
                  name={`steps.${i}.days`}
                  label={t('settings.hrRules.lateness.stepLabel', { hour: i + 1 })}
                  placeholder={t('settings.hrRules.daysPlaceholder')}
                  suffix={t('ui.units.days')}
                  decimals={2}
                  required
                  className="flex-1"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="mt-7"
                  aria-label={t('settings.hrRules.lateness.removeStep', { hour: i + 1 })}
                  disabled={steps.fields.length <= 1}
                  onClick={() => steps.remove(i)}
                >
                  <RemoveIcon />
                </Button>
              </li>
            ))}
          </ol>
          {stepsError ? <p className="text-xs font-semibold text-destructive-ink">{t(stepsError)}</p> : null}
          <div>
            <Button
              variant="soft"
              size="sm"
              disabled={steps.fields.length >= MAX_STEPS}
              onClick={() => steps.append({ days: 0.5 })}
            >
              <AddIcon />
              {t('settings.hrRules.lateness.addStep')}
            </Button>
          </div>
        </fieldset>

        <LatenessExample control={form.control} />
      </SectionPanel>

      <SectionPanel title={t('settings.hrRules.payroll.title')} description={t('settings.hrRules.payroll.description')}>
        <div className="grid gap-5 md:grid-cols-2">
          <NumberField
            control={form.control}
            name="dayDivisor"
            label={t('settings.hrRules.payroll.divisor')}
            hint={t('settings.hrRules.payroll.divisorHint')}
            placeholder={t('settings.hrRules.payroll.divisorPlaceholder')}
            required
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {PART_TIME_WORK_SYSTEMS.map((system) => (
            <NumberField
              key={system}
              control={form.control}
              name={`partTime.${system}`}
              label={t(`common.enums.workSystem.${system}`)}
              placeholder={t('settings.hrRules.payroll.percentPlaceholder')}
              suffix="%"
              required
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('settings.hrRules.payroll.partTimeHint')}</p>
      </SectionPanel>

      <SectionPanel title={t('settings.hrRules.penalties.title')} description={t('settings.hrRules.penalties.description')}>
        <div className="grid gap-5 md:grid-cols-2">
          <SelectField
            control={form.control}
            name="repetitionWindow"
            label={t('settings.hrRules.penalties.window')}
            options={REPETITION_WINDOWS.map((w) => ({ value: w, label: t(`common.enums.repetitionWindow.${w}`) }))}
            required
          />
        </div>
      </SectionPanel>
      {/* A child of the form, not of the last card, so it can stay in view over the whole form. */}
      <Can permission="hr.settings.edit">
        <SaveBar
          dirty={isDirty}
          valid={isValid}
          saving={isSubmitting}
          saved={saved && !isDirty}
          onDiscard={() => {
            form.reset();
            setSaved(false);
          }}
        />
      </Can>
    </Form>
  );
}

const EXAMPLE_DEFAULT = 90;

/**
 * "90 minutes → 0.75 days", live as the rule is edited. Computed with the shared `latenessDays` —
 * the same function the API uses for the lateness list and payroll (no second copy of the rule).
 */
function LatenessExample({ control }: { control: Control<HrRulesFormValues> }) {
  const { t, locale } = useTranslation();
  const id = useId();
  const [minutesText, setMinutesText] = useState(String(EXAMPLE_DEFAULT));
  const [graceMinutes, steps, extraHourDays] = useWatch({ control, name: ['graceMinutes', 'steps', 'extraHourDays'] });
  const rule = ruleFromForm({ graceMinutes, steps, extraHourDays });
  const minutes = minutesText === '' ? null : Number(minutesText);

  let line: string;
  if (!rule) line = t('settings.hrRules.example.invalidRule');
  else if (minutes === null) line = t('settings.hrRules.example.enterMinutes');
  else line = t('settings.hrRules.example.line', { count: formatCount(minutes), days: formatDayCount(latenessDays(minutes, rule), locale) });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary-soft bg-primary-soft/50 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-40 flex-col gap-2">
          <Label htmlFor={id}>{t('settings.hrRules.example.minutes')}</Label>
          <Input
            id={id}
            inputMode="numeric"
            dir="ltr"
            className="tabular"
            placeholder={t('settings.hrRules.example.minutesPlaceholder')}
            value={minutesText}
            onChange={(e) => {
              const next = e.target.value.replace(/,/g, '');
              if (!/^\d*$/.test(next) || Number(next) > SETTING_LIMITS.latenessMinutesMax) return;
              setMinutesText(next);
            }}
          />
        </div>
        <p className="min-w-0 flex-1 basis-48 pb-2.5 text-sm font-semibold" aria-live="polite" data-testid="lateness-example">
          <span className="text-muted-foreground">{t('settings.hrRules.example.label')} </span>
          <bdi>{line}</bdi>
        </p>
      </div>
    </div>
  );
}

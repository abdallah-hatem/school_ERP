'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  HR_SETTINGS_DEFAULTS,
  NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_TYPES,
  NotificationSettingKey,
  SETTING_DEFAULTS,
  type HrSettings,
  type NotificationSettings,
  type UpdateHrSettingsRequest,
} from '@school-erp/shared';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useCan } from '@/core/auth';
import { GET_NOTIFICATION_SETTINGS, NotificationsI18n, TypeSwitchList, UPDATE_NOTIFICATION_SETTINGS } from '@/core/notifications';
import { callApi } from '@/lib/callApi';
import type { ApiResult } from '@/lib/types';
import { NumberField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { ErrorState } from '@/shared/components/layout/empty-state';
import { LockedIcon } from '@/shared/components/ui/icons';
import { SkeletonMask } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_HR_SETTINGS, UPDATE_HR_SETTINGS } from '../apis';
import { useReportDirty } from '../hooks/unsaved-changes';
import { useResource } from '../hooks/use-resource';
import { notificationSettingsSchema, type NotificationSettingsFormValues, type ReminderTimingValues } from '../schemas';
import { SaveBar, SectionPanel } from './section-panel';

/** The HR rules this screen shows: the probation length and the reminder timings (`hr.reminders.*`). */
type HrRules = HrSettings;

/** The registry's types at their defaults, as the form's skeleton while the settings load. */
const PLACEHOLDER: NotificationSettings = {
  channels: [{ channel: 'in_app', available: true }],
  defaults: NOTIFICATION_TYPE_KEYS.map((type) => {
    const def = NOTIFICATION_TYPES[type];
    return { type, module: def.module, category: def.category, channel: 'in_app', enabled: true, locked: !def.canTurnOff };
  }),
  retention: {
    readDays: SETTING_DEFAULTS[NotificationSettingKey.RETENTION_READ_DAYS],
    resolvedDays: SETTING_DEFAULTS[NotificationSettingKey.RETENTION_RESOLVED_DAYS],
    maxDays: SETTING_DEFAULTS[NotificationSettingKey.RETENTION_MAX_DAYS],
  },
};

const inAppDefaults = (s: NotificationSettings) => s.defaults.filter((d) => d.channel === 'in_app');

function toForm(s: NotificationSettings, hr: HrRules | null): NotificationSettingsFormValues {
  return {
    defaults: inAppDefaults(s).map((d) => d.locked || d.enabled),
    retention: { ...s.retention },
    hr: hr
      ? {
          defaultProbationMonths: hr.employees.defaultProbationMonths,
          ...(hr.reminders ? { reminders: { ...hr.reminders } } : {}),
        }
      : undefined,
  };
}

const noHrRules = async (): Promise<ApiResult<HrRules | null>> => ({ success: true, status: 200, data: null });

/**
 * Settings → Notifications (§11, option A): what everyone receives unless they change it (one
 * switch per type; required ones locked), the reminder timings (HR rules) and how long
 * notifications are kept. The defaults and the retention follow `core.notifications.manage` (the
 * System admin; the HR manager sees them read-only); the timings follow `hr.settings.edit`.
 */
export function NotificationsSection() {
  const { locale } = useTranslation();
  const can = useCan();
  const readsHr = can('hr.settings.view');
  const settings = useResource('notification-settings', () => GET_NOTIFICATION_SETTINGS());
  const hr = useResource<HrRules | null>(readsHr ? 'hr-settings' : 'no-hr-settings', () =>
    readsHr ? GET_HR_SETTINGS() : noHrRules(),
  );

  return (
    <NotificationsI18n locale={locale}>
      {settings.error || hr.error ? (
        <ErrorPanel
          onRetry={() => {
            if (settings.error) settings.retry();
            if (hr.error) hr.retry();
          }}
          retrying={settings.retrying || hr.retrying}
        />
      ) : settings.data === undefined || hr.data === undefined ? (
        <SkeletonMask>
          <NotificationSettingsForm
            initial={PLACEHOLDER}
            hr={readsHr ? HR_SETTINGS_DEFAULTS : null}
            onSaved={() => undefined}
          />
        </SkeletonMask>
      ) : (
        <NotificationSettingsForm
          initial={settings.data}
          hr={hr.data}
          onSaved={(next, nextHr) => {
            settings.setData(() => next);
            if (nextHr) hr.setData(() => nextHr);
          }}
        />
      )}
    </NotificationsI18n>
  );
}

function ErrorPanel({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const { t } = useTranslation();
  return (
    <SectionPanel title={t('settings.sections.notifications.title')}>
      <ErrorState onRetry={onRetry} retrying={retrying} />
    </SectionPanel>
  );
}

function NotificationSettingsForm({
  initial,
  hr,
  onSaved,
}: {
  initial: NotificationSettings;
  hr: HrRules | null;
  onSaved: (next: NotificationSettings, nextHr: HrRules | null) => void;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const canManage = can('core.notifications.manage');
  const canEditHr = can('hr.settings.edit');
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const form = useForm<NotificationSettingsFormValues>({
    resolver: zodResolver(notificationSettingsSchema),
    mode: 'onChange',
    defaultValues: toForm(initial, hr),
  });
  const { isDirty, isValid, isSubmitting, dirtyFields } = form.formState;
  useReportDirty('notification-settings', isDirty);
  const types = inAppDefaults(initial);
  const defaults = useWatch({ control: form.control, name: 'defaults' });

  async function save(values: NotificationSettingsFormValues) {
    if (busy.current) return;
    busy.current = true;
    try {
      let next = initial;
      let nextHr = hr;
      // Only what changed: each changed switch or value is one line of the audit entry (§9).
      const changedDefaults = types
        .map((d, i) => ({ type: d.type, channel: d.channel, enabled: values.defaults[i] ?? d.enabled, was: d.enabled, locked: d.locked }))
        .filter((d) => !d.locked && d.enabled !== d.was)
        .map(({ type, channel, enabled }) => ({ type, channel, enabled }));
      const retention: Partial<NotificationSettings['retention']> = {};
      for (const key of ['readDays', 'resolvedDays', 'maxDays'] as const) {
        if (dirtyFields.retention?.[key]) retention[key] = values.retention[key];
      }
      if (canManage && (changedDefaults.length || Object.keys(retention).length)) {
        const res = await callApi(
          UPDATE_NOTIFICATION_SETTINGS({
            ...(changedDefaults.length ? { defaults: changedDefaults } : {}),
            ...(Object.keys(retention).length ? { retention } : {}),
          }),
        );
        if (!res.success || !res.data) return;
        next = res.data;
      }

      const body: UpdateHrSettingsRequest = {};
      if (dirtyFields.hr?.defaultProbationMonths && values.hr) {
        body.employees = { defaultProbationMonths: values.hr.defaultProbationMonths };
      }
      if (values.hr?.reminders && dirtyFields.hr?.reminders) {
        const reminders: Partial<ReminderTimingValues> = {};
        for (const [key, dirty] of Object.entries(dirtyFields.hr.reminders) as [keyof ReminderTimingValues, boolean][]) {
          if (dirty) reminders[key] = values.hr.reminders[key];
        }
        if (Object.keys(reminders).length) body.reminders = reminders;
      }
      if (canEditHr && Object.keys(body).length) {
        const res = await callApi(UPDATE_HR_SETTINGS(body));
        if (!res.success || !res.data) {
          // The notification part is saved (the screen now holds it); the HR edits stay to retry.
          onSaved(next, null);
          return;
        }
        nextHr = res.data;
      }
      form.reset(toForm(next, nextHr));
      setSaved(true);
      onSaved(next, nextHr);
    } finally {
      busy.current = false;
    }
  }

  const rows = types.map((d, i) => {
    const on = d.locked || (defaults?.[i] ?? d.enabled);
    return {
      type: d.type,
      module: d.module,
      category: d.category,
      checked: on,
      locked: d.locked,
      disabled: !canManage,
      note: on ? t('notifications.preferences.onByDefault') : t('notifications.preferences.offByDefault'),
      onChange: (next: boolean) => {
        form.setValue(`defaults.${i}`, next, { shouldDirty: true, shouldValidate: true });
        setSaved(false);
      },
    };
  });

  const days = t('notifications.settings.units.days');
  const ofMonth = t('notifications.settings.units.ofMonth');
  const readOnlyNote = canManage ? null : (
    <p className="-mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <LockedIcon className="size-3.5" />
      {t('notifications.settings.readOnly')}
    </p>
  );

  return (
    <Form
      onSubmit={(e) => {
        setSaved(false);
        void form.handleSubmit(save)(e);
      }}
      className="gap-6"
    >
      <SectionPanel
        title={t('notifications.settings.defaults.title')}
        description={t('notifications.settings.defaults.description')}
      >
        {readOnlyNote}
        <TypeSwitchList rows={rows} columnLabel={t('notifications.preferences.forEveryone')} framed={false} />
      </SectionPanel>

      {hr ? (
        <SectionPanel title={t('notifications.settings.timing.title')} description={t('notifications.settings.timing.description')}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {hr.reminders ? (
              <>
                <TimingField form={form} name="hr.reminders.contractEndDays" suffix={days} placeholder="30" disabled={!canEditHr} />
                <TimingField form={form} name="hr.reminders.contractEndSecondDays" suffix={days} placeholder="7" disabled={!canEditHr} />
                <TimingField form={form} name="hr.reminders.probationEndDays" suffix={days} placeholder="7" disabled={!canEditHr} />
              </>
            ) : null}
            <NumberField
              control={form.control}
              name="hr.defaultProbationMonths"
              label={t('notifications.settings.timing.probationMonths')}
              hint={t('notifications.settings.timing.probationMonthsHint')}
              placeholder="3"
              suffix={t('notifications.settings.units.months')}
              required
              disabled={!canEditHr}
            />
            {hr.reminders ? (
              <>
                <TimingField form={form} name="hr.reminders.latenessCheckDay" suffix={ofMonth} placeholder="25" disabled={!canEditHr} />
                <TimingField form={form} name="hr.reminders.payrollCheckDay" suffix={ofMonth} placeholder="28" disabled={!canEditHr} />
              </>
            ) : null}
          </div>
        </SectionPanel>
      ) : null}

      <SectionPanel
        title={t('notifications.settings.retention.title')}
        description={t('notifications.settings.retention.description')}
      >
        {readOnlyNote}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {(['readDays', 'resolvedDays', 'maxDays'] as const).map((key) => (
            <NumberField
              key={key}
              control={form.control}
              name={`retention.${key}`}
              label={t(`notifications.settings.retention.${key}`)}
              hint={t(`notifications.settings.retention.${key}Hint`)}
              placeholder={String(PLACEHOLDER.retention[key])}
              suffix={days}
              required
              disabled={!canManage}
            />
          ))}
        </div>
      </SectionPanel>

      {canManage || (canEditHr && hr) ? (
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
      ) : null}
    </Form>
  );
}

type ReminderField = `hr.reminders.${keyof ReminderTimingValues}`;

/** One reminder timing: its label and hint from the field's name, a whole number with its unit. */
function TimingField({
  form,
  name,
  suffix,
  placeholder,
  disabled,
}: {
  form: ReturnType<typeof useForm<NotificationSettingsFormValues>>;
  name: ReminderField;
  suffix: string;
  placeholder: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const key = name.slice('hr.reminders.'.length);
  return (
    <NumberField
      control={form.control}
      name={name}
      label={t(`notifications.settings.timing.${key}`)}
      hint={t(`notifications.settings.timing.${key}Hint`)}
      placeholder={placeholder}
      suffix={suffix}
      required
      disabled={disabled}
    />
  );
}

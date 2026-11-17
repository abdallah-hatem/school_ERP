'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { SchoolSettingKey, SETTING_DEFAULTS, WEEKDAYS, workTimeOptions, type SchoolSettings, type UpdateSchoolSettingsRequest } from '@school-erp/shared';
import { useRef, useState } from 'react';
import { Can } from '@/core/auth';
import { useForm } from 'react-hook-form';
import { brandingFrom, useSchoolBranding } from '@/core/settings';
import { SelectField, TextField, ToggleGroupField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { ErrorState } from '@/shared/components/layout/empty-state';
import { SkeletonMask } from '@/shared/components/ui/skeleton';
import { callApi } from '@/lib/callApi';
import { formatTimeOfDay } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_SCHOOL_SETTINGS_FOR_EDIT, UPDATE_SCHOOL_SETTINGS } from '../apis';
import { useReportDirty } from '../hooks/unsaved-changes';
import { useResource } from '../hooks/use-resource';
import { NAME_MAX, schoolSchema, type SchoolFormValues } from '../schemas';
import { LogoCard } from './logo-card';
import { SaveBar, SectionPanel } from './section-panel';

const noop = () => undefined;

const PLACEHOLDER: SchoolSettings = {
  nameEn: '',
  nameAr: '',
  logoUrl: null,
  defaultLanguage: SETTING_DEFAULTS[SchoolSettingKey.DEFAULT_LANGUAGE],
  workStart: SETTING_DEFAULTS[SchoolSettingKey.WORK_START],
  workEnd: SETTING_DEFAULTS[SchoolSettingKey.WORK_END],
  workingDays: SETTING_DEFAULTS[SchoolSettingKey.WORKING_DAYS],
};

function toForm(s: SchoolSettings): SchoolFormValues {
  return {
    nameEn: s.nameEn,
    nameAr: s.nameAr,
    defaultLanguage: s.defaultLanguage,
    workStart: s.workStart,
    workEnd: s.workEnd,
    workingDays: s.workingDays,
  };
}

/** School identity, language, hours and working days (§7), plus the logo. */
export function SchoolSection() {
  const { t } = useTranslation();
  const school = useResource('school', () => GET_SCHOOL_SETTINGS_FOR_EDIT());

  if (school.error) {
    return (
      <SectionPanel title={t('settings.sections.school.title')}>
        <ErrorState onRetry={school.retry} retrying={school.retrying} />
      </SectionPanel>
    );
  }
  if (!school.data) {
    // The form itself as its skeleton (the §7 defaults as placeholders): every field in place.
    return (
      <SkeletonMask>
        <div className="flex flex-col gap-6">
          <SchoolForm initial={PLACEHOLDER} onSaved={noop} />
          <LogoCard logoUrl={null} onUploaded={noop} />
        </div>
      </SkeletonMask>
    );
  }

  const data = school.data;
  return (
    <div className="flex flex-col gap-6">
      <SchoolForm initial={data} onSaved={(next) => school.setData(() => next)} />
      <LogoCard logoUrl={data.logoUrl} onUploaded={(logoUrl) => school.setData((s) => ({ ...s, logoUrl }))} />
    </div>
  );
}

function SchoolForm({ initial, onSaved }: { initial: SchoolSettings; onSaved: (next: SchoolSettings) => void }) {
  const { t, locale } = useTranslation();
  const { branding, setBranding } = useSchoolBranding();
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);

  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolSchema),
    mode: 'onChange',
    defaultValues: toForm(initial),
  });
  const { isDirty, isValid, isSubmitting, dirtyFields } = form.formState;
  useReportDirty('school', isDirty);

  async function save(values: SchoolFormValues) {
    if (busy.current) return;
    busy.current = true;
    try {
      // Only what changed: each changed key writes one history row.
      const changes: UpdateSchoolSettingsRequest = {};
      for (const key of Object.keys(dirtyFields) as (keyof SchoolFormValues)[]) {
        Object.assign(changes, { [key]: values[key] });
      }
      const res = await callApi(UPDATE_SCHOOL_SETTINGS(changes));
      if (res.success && res.data) {
        form.reset(toForm(res.data));
        setSaved(true);
        onSaved(res.data);
        // The shell shows the new name at once (no reload).
        setBranding(brandingFrom(res.data, branding));
      }
    } finally {
      busy.current = false;
    }
  }

  const weekdayOptions = WEEKDAYS.map((d) => ({ value: d, label: t(`common.enums.weekday.${d}`) }));
  // 05:00 … 20:00 every 30 minutes (§7), in the viewer's time format; the stored value always shows.
  const timeOptions = (current: string) =>
    workTimeOptions(current).map((time) => ({ value: time, label: formatTimeOfDay(time, locale) }));
  const languageOptions = [
    { value: 'ar', label: t('common.common.arabic') },
    { value: 'en', label: t('common.common.english') },
  ];

  return (
    <SectionPanel title={t('settings.sections.school.title')} description={t('settings.sections.school.description')}>
      <Form
        onSubmit={(e) => {
          setSaved(false);
          void form.handleSubmit(save)(e);
        }}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            control={form.control}
            name="nameEn"
            label={t('settings.school.nameEn')}
            placeholder={t('settings.school.nameEnPlaceholder')}
            maxLength={NAME_MAX.school}
            dir="ltr"
            required
          />
          <TextField
            control={form.control}
            name="nameAr"
            label={t('settings.school.nameAr')}
            placeholder={t('settings.school.nameArPlaceholder')}
            maxLength={NAME_MAX.school}
            dir="rtl"
            required
          />
          <SelectField
            control={form.control}
            name="defaultLanguage"
            label={t('settings.school.defaultLanguage')}
            hint={t('settings.school.defaultLanguageHint')}
            options={languageOptions}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              control={form.control}
              name="workStart"
              label={t('settings.school.workStart')}
              placeholder={t('settings.school.workStartPlaceholder')}
              hint={t('settings.school.timeHint')}
              options={timeOptions(initial.workStart)}
              required
            />
            <SelectField
              control={form.control}
              name="workEnd"
              label={t('settings.school.workEnd')}
              placeholder={t('settings.school.workEndPlaceholder')}
              options={timeOptions(initial.workEnd)}
              required
            />
          </div>
        </div>
        <ToggleGroupField
          control={form.control}
          name="workingDays"
          label={t('settings.school.workingDays')}
          options={weekdayOptions}
          required
        />
        <Can permission="core.settings.edit">
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
    </SectionPanel>
  );
}

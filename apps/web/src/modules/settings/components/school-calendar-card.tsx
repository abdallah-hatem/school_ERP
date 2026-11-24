'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  contractYearOf,
  contractYearRange,
  formatContractYear,
  schoolCalendarIssues,
  schoolDayOf,
  type SchoolCalendar,
  type SchoolCalendarDates,
} from '@school-erp/shared';
import { useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Can, useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { DateField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { YearStepper } from '@/shared/components/form/year-stepper';
import { ErrorState } from '@/shared/components/layout/empty-state';
import { SkeletonMask } from '@/shared/components/ui/skeleton';
import { apiErrorText } from '@/shared/lib/api-error';
import { formatDate } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_SCHOOL_CALENDAR, PUT_SCHOOL_CALENDAR } from '../apis';
import { useReportDirty } from '../hooks/unsaved-changes';
import { useResource } from '../hooks/use-resource';
import { SaveBar, SectionPanel } from './section-panel';

const FIELDS = ['term1Start', 'term1End', 'term2Start', 'nonRenewalDeadline'] as const;
type CalendarForm = Record<(typeof FIELDS)[number], string | null>;

const REQUIRED = 'ui.form.required';
const INVALID = 'settings.hrRules.calendar.invalid';

/** The four dates, each required, inside the contract year and in order (the shared rule the API applies). */
function calendarSchema(year: number) {
  return z
    .object({
      term1Start: z.string().nullable(),
      term1End: z.string().nullable(),
      term2Start: z.string().nullable(),
      nonRenewalDeadline: z.string().nullable(),
    })
    .superRefine((v, ctx) => {
      const missing = FIELDS.filter((f) => !v[f]);
      for (const f of missing) ctx.addIssue({ code: 'custom', path: [f], message: REQUIRED });
      if (missing.length) return;
      for (const f of schoolCalendarIssues(year, v as SchoolCalendarDates)) {
        ctx.addIssue({ code: 'custom', path: [f], message: INVALID });
      }
    });
}

const EMPTY: CalendarForm = { term1Start: null, term1End: null, term2Start: null, nonRenewalDeadline: null };

/**
 * Settings → HR rules → School calendar (spec 2026-11-24): one contract year at a time (the current
 * one first), the first and last day of term 1, the first day of term 2 and the non-renewal
 * deadline. The contracts screens read them for the notice window and early termination. Read-only
 * without `hr.settings.edit`.
 */
export function SchoolCalendarCard() {
  const { t } = useTranslation();
  const [year, setYear] = useState(() => contractYearOf(schoolDayOf(new Date())));
  const calendar = useResource(`school-calendar-${year}`, () => GET_SCHOOL_CALENDAR(year));
  const loaded = calendar.data && calendar.data.year === year ? calendar.data : undefined;

  const stepper = (
    <YearStepper
      year={year}
      onChange={setYear}
      label={t('settings.hrRules.calendar.year')}
      previousLabel={t('settings.hrRules.calendar.previousYear')}
      nextLabel={t('settings.hrRules.calendar.nextYear')}
      format={formatContractYear}
      disabled={!loaded}
    />
  );

  if (calendar.error) {
    return (
      <SectionPanel title={t('settings.hrRules.calendar.title')} description={t('settings.hrRules.calendar.description')} actions={stepper}>
        <ErrorState onRetry={calendar.retry} retrying={calendar.retrying} />
      </SectionPanel>
    );
  }
  if (!loaded) {
    return (
      <SkeletonMask>
        <CalendarForm key={`loading-${year}`} calendar={{ year, calendar: null }} stepper={stepper} onSaved={() => undefined} />
      </SkeletonMask>
    );
  }
  return (
    <CalendarForm key={year} calendar={loaded} stepper={stepper} onSaved={(next) => calendar.setData(() => next)} />
  );
}

function CalendarForm({
  calendar,
  stepper,
  onSaved,
}: {
  calendar: SchoolCalendar;
  stepper: ReactNode;
  onSaved: (next: SchoolCalendar) => void;
}) {
  const { t, has, locale } = useTranslation();
  const canEdit = useCan()('hr.settings.edit');
  const { year } = calendar;
  const range = contractYearRange(year);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const form = useForm<CalendarForm>({
    resolver: zodResolver(calendarSchema(year)),
    mode: 'onChange',
    defaultValues: calendar.calendar ?? EMPTY,
  });
  const { isDirty, isValid, isSubmitting } = form.formState;
  useReportDirty('school-calendar', isDirty);

  async function save(values: CalendarForm) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const res = await callApi(PUT_SCHOOL_CALENDAR(year, values as SchoolCalendarDates), {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('settings.hrRules.calendar.saved'),
      });
      if (res.unauthorized) return;
      if (res.success && res.data) {
        form.reset(res.data.calendar ?? EMPTY);
        setSaved(true);
        onSaved(res.data);
      } else if (res.success === false) {
        setError(apiErrorText(res, { t, has, locale }) || t('errors.INTERNAL_ERROR'));
      }
    } finally {
      busy.current = false;
    }
  }

  return (
    <Form
      onSubmit={(e) => {
        setSaved(false);
        void form.handleSubmit(save)(e);
      }}
      className="gap-6"
    >
      <SectionPanel
        title={t('settings.hrRules.calendar.title')}
        description={
          calendar.calendar
            ? t('settings.hrRules.calendar.description')
            : `${t('settings.hrRules.calendar.description')} ${t('settings.hrRules.calendar.notSet', { year: formatContractYear(year) })}`
        }
        actions={stepper}
      >
        <div className="grid gap-5 md:grid-cols-2">
          {FIELDS.map((field) => (
            <DateField
              key={field}
              control={form.control}
              name={field}
              label={t(`settings.hrRules.calendar.${field}`)}
              hint={
                field === 'term1Start'
                  ? `${formatDate(range.start, locale)} – ${formatDate(range.end, locale)}`
                  : t(`settings.hrRules.calendar.${field}Hint`)
              }
              placeholder={t('settings.hrRules.calendar.placeholder')}
              min={range.start}
              max={range.end}
              required
              disabled={!canEdit}
            />
          ))}
        </div>
        {error ? (
          <p role="alert" className="rounded-xl bg-destructive-soft px-3.5 py-2.5 text-sm font-semibold text-destructive-ink">
            {error}
          </p>
        ) : null}
      </SectionPanel>
      <Can permission="hr.settings.edit">
        <SaveBar
          dirty={isDirty}
          valid={isValid}
          saving={isSubmitting}
          saved={saved && !isDirty}
          saveLabel={t('settings.hrRules.calendar.save')}
          onDiscard={() => {
            form.reset();
            setSaved(false);
          }}
        />
      </Can>
    </Form>
  );
}

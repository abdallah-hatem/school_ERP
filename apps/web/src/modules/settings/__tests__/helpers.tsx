import { SETTING_DEFAULTS, type HrSettings, type SchoolSettings } from '@school-erp/shared';
import type { ReactElement } from 'react';
import { SchoolBrandingProvider } from '@/core/settings';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import type { SessionUser } from '@school-erp/shared';
import { renderWithI18n, TEST_SESSION } from '@/test/render';
import { getSettingsMessages } from '../i18n';

/** Render inside the real translations (base + `settings`) and the shell's branding provider. */
export function renderSettings(ui: ReactElement, locale: Locale = 'en', session: SessionUser = TEST_SESSION) {
  return renderWithI18n(
    <I18nProvider messages={{ settings: getSettingsMessages(locale) } as unknown as MessageTree}>
      <SchoolBrandingProvider initial={{ nameEn: school.nameEn, nameAr: school.nameAr, logoUrl: null }}>{ui}</SchoolBrandingProvider>
    </I18nProvider>,
    { locale, session },
  );
}

/** A successful `apiFetch` result. */
export function ok<T>(data: T, meta?: { total: number; page: number; limit: number }) {
  return Promise.resolve({ success: true as const, status: 200, data, meta });
}

/** A promise the test resolves itself (to hold a request open). */
export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

export const school: SchoolSettings = {
  nameEn: 'Green Valley School',
  nameAr: 'مدرسة الوادي الأخضر',
  logoUrl: null,
  defaultLanguage: 'ar',
  workStart: '07:30',
  workEnd: '15:00',
  workingDays: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
  addressEn: '',
  addressAr: '',
  signatoryNameEn: '',
  signatoryNameAr: '',
  signatoryTitleEn: '',
  signatoryTitleAr: '',
};

export const hrSettings: HrSettings = {
  lateness: {
    graceMinutes: SETTING_DEFAULTS['hr.lateness.graceMinutes'],
    steps: SETTING_DEFAULTS['hr.lateness.steps'],
    extraHourDays: SETTING_DEFAULTS['hr.lateness.extraHourDays'],
  },
  payroll: {
    dayDivisor: SETTING_DEFAULTS['hr.payroll.dayDivisor'],
    partTime: SETTING_DEFAULTS['hr.payroll.partTime'],
  },
  penalties: { repetitionWindow: SETTING_DEFAULTS['hr.penalties.repetitionWindow'] },
  employees: { defaultProbationMonths: SETTING_DEFAULTS['hr.employees.defaultProbationMonths'] },
  reminders: {
    contractEndDays: SETTING_DEFAULTS['hr.reminders.contractEndDays'],
    contractEndSecondDays: SETTING_DEFAULTS['hr.reminders.contractEndSecondDays'],
    probationEndDays: SETTING_DEFAULTS['hr.reminders.probationEndDays'],
    latenessCheckDay: SETTING_DEFAULTS['hr.reminders.latenessCheckDay'],
    payrollCheckDay: SETTING_DEFAULTS['hr.reminders.payrollCheckDay'],
    renewalDecisionsDays: SETTING_DEFAULTS['hr.reminders.renewalDecisionsDays'],
    noticeWindowCloseDays: SETTING_DEFAULTS['hr.reminders.noticeWindowCloseDays'],
  },
};

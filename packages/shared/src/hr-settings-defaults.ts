import { SETTING_DEFAULTS } from './settings';
import type { HrSettings } from './types/hr';

/**
 * The HR rules as §7's defaults: the shape of the HR settings before a school changes any, which
 * screens also draw while the real ones load (the settings form, the payroll rules panel).
 */
export const HR_SETTINGS_DEFAULTS: HrSettings = {
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

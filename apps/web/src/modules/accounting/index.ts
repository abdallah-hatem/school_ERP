/*
 * Front door of the accounting screens (§10): payroll taxes — the year board and each approved
 * month's statement. Routes under `app/[locale]/(dashboard)/accounting` import from here only.
 */
export { PayrollTaxesMonthScreen, PayrollTaxesScreen } from './screens';
export { PayrollTaxesMonthSkeleton, PayrollTaxesSkeleton } from './components/skeletons';
export type { SearchParamsRecord } from './lib/payroll-taxes';

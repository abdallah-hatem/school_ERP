/*
 * Front door of the accounting screens (§10): Payroll — HR's approved months with insurance and
 * taxes — and payroll taxes — the year board and each approved month's statement. Routes under
 * `app/[locale]/(dashboard)/accounting` import from here only.
 */
export {
  AccountingPayrollMonthScreen,
  AccountingPayrollScreen,
  PayrollTaxesMonthScreen,
  PayrollTaxesScreen,
} from './screens';
export {
  AccountingPayrollMonthSkeleton,
  AccountingPayrollSkeleton,
  PayrollTaxesMonthSkeleton,
  PayrollTaxesSkeleton,
} from './components/skeletons';
export type { SearchParamsRecord } from './lib/payroll-taxes';

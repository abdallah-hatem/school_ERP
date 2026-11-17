import { IsMonth } from '../../../../common/validators/month.validator';

/** `/accounting/payroll/:month` — `YYYY-MM`. */
export class AccountingPayrollMonthParamDto {
  @IsMonth()
  month: string;
}

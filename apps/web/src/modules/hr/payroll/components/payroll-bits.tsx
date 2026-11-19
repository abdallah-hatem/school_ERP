'use client';

import { PayrollStatus, type PayrollFlag } from '@school-erp/shared';
import { Money } from '@/shared/components/ui/figures';
import { LockedIcon, PendingIcon, ReadyIcon } from '@/shared/components/ui/icons';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * Draft (in progress, sunflower), Approved (done), or — once Accounting marked the salaries
 * transferred — Finalized · transferred.
 */
export function RunStatusPill({ status, transferred = false }: { status: PayrollStatus; transferred?: boolean }) {
  const { t } = useTranslation();
  if (status === PayrollStatus.APPROVED && transferred) {
    return (
      <StatusPill tone="success" icon={LockedIcon}>
        {t('payroll.transferred')}
      </StatusPill>
    );
  }
  return (
    <StatusPill tone={status === PayrollStatus.APPROVED ? 'success' : 'accent'}>
      {t(`common.enums.payrollStatus.${status}`)}
    </StatusPill>
  );
}

/** A line is "needs review" when it carries any flag (§6); the flags are listed under the pill. */
export function LineStatus({ flags }: { flags: readonly PayrollFlag[] }) {
  const { t } = useTranslation();
  if (flags.length === 0) {
    return (
      <StatusPill tone="success" icon={ReadyIcon}>
        {t('payroll.table.ready')}
      </StatusPill>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <StatusPill tone="warning" icon={PendingIcon}>
        {t('payroll.table.needsReview')}
      </StatusPill>
      <span className="text-warning-ink text-xs whitespace-normal">
        {flags.map((f) => t(`common.enums.payrollFlag.${f}`)).join(' · ')}
      </span>
    </span>
  );
}

/** A deduction: red when it costs something, muted at 0. */
export function DeductionAmount({ value }: { value: number | undefined }) {
  return (
    <Money
      value={value}
      currency={false}
      className={cn((value ?? 0) > 0 ? 'text-destructive-ink font-semibold' : 'text-muted-foreground')}
    />
  );
}

/** Additions − deductions with its sign (`+500.00`, `-250.00`), muted at 0. */
export function SignedAmount({ value }: { value: number | undefined }) {
  // Hidden (R7): the dash alone.
  if (value === undefined) return <Money value={undefined} currency={false} />;
  return (
    <span
      dir="ltr"
      className={cn(
        'tabular whitespace-nowrap',
        value > 0 && 'text-success-ink font-semibold',
        value < 0 && 'text-destructive-ink font-semibold',
        value === 0 && 'text-muted-foreground',
      )}
    >
      {value > 0 ? '+' : ''}
      <Money value={value} currency={false} />
    </span>
  );
}

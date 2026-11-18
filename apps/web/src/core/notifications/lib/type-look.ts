import {
  ContractEndIcon,
  LatenessDueIcon,
  NotificationsIcon,
  PayrollDueIcon,
  PayrollIcon,
  PenaltiesIcon,
  ProbationEndIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';

/**
 * Each type's icon and the soft tint of its chip (design/mockups/notifications.html): penalties in
 * the "needs a look" warning tone, payroll in primary, the employee reminders in info, lateness in
 * the sunflower "in progress" tone. A type added later without an entry gets the plain bell.
 */
const LOOKS: Record<string, { icon: AppIcon; tone: string }> = {
  'hr.penalty.awaiting_approval': { icon: PenaltiesIcon, tone: 'bg-warning-soft text-warning-ink' },
  'hr.payroll.ready_to_approve': { icon: PayrollIcon, tone: 'bg-primary-soft text-primary' },
  'hr.contract.ending_soon': { icon: ContractEndIcon, tone: 'bg-info-soft text-info-ink' },
  'hr.probation.ending_soon': { icon: ProbationEndIcon, tone: 'bg-info-soft text-info-ink' },
  'hr.lateness.not_entered': { icon: LatenessDueIcon, tone: 'bg-accent-soft text-accent-foreground' },
  'hr.payroll.not_prepared': { icon: PayrollDueIcon, tone: 'bg-primary-soft text-primary' },
  'hr.payroll.not_approved': { icon: PayrollDueIcon, tone: 'bg-primary-soft text-primary' },
};

const FALLBACK = { icon: NotificationsIcon, tone: 'bg-secondary text-muted-foreground' };

export function typeLook(type: string): { icon: AppIcon; tone: string } {
  return LOOKS[type] ?? FALLBACK;
}

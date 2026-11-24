'use client';

import { ContractDecision, lastDayOf, type Contract, type ContractDecision as Decision } from '@school-erp/shared';
import { EmployeeLink } from '@/core/employees';
import { PersonAvatar } from '@/shared/components/ui/person-avatar';
import { SkeletonIdentity, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { DECISION_TONE, decisionTags } from '../lib/contract-text';

/** A contract's decision as its pill (`common.enums.contractDecision`). */
export function ContractDecisionPill({ decision }: { decision: Decision }) {
  const { t } = useTranslation();
  return <StatusPill tone={DECISION_TONE[decision]}>{t(`common.enums.contractDecision.${decision}`)}</StatusPill>;
}

/** `1 Jun 2026 – 31 May 2027`, the contract's dates (wraps between them on a narrow column). */
export function ContractDates({ contract }: { contract: Pick<Contract, 'startsOn' | 'endsOn'> }) {
  const { t, locale } = useTranslation();
  return (
    <bdi className="tabular">
      {t('contracts.dates', { start: formatDate(contract.startsOn, locale), end: formatDate(contract.endsOn, locale) })}
    </bdi>
  );
}

/**
 * The line under a decision: who decided and when; when a notice was received; when an early
 * termination was requested and where it would end; that an undecided contract ended.
 */
export function decisionSubLine(
  c: Contract,
  t: ReturnType<typeof useTranslation>['t'],
  locale: ReturnType<typeof useTranslation>['locale'],
): string | null {
  const day = (d: string) => formatDate(d, locale);
  switch (c.decision) {
    case ContractDecision.NOTICE:
      return c.notice ? t('contracts.sub.received', { date: day(c.notice.receivedOn) }) : null;
    case ContractDecision.EARLY_REQUESTED: {
      const et = c.earlyTermination;
      if (!et) return null;
      return et.wouldEndOn
        ? t('contracts.sub.requested', { date: day(et.requestedOn), end: day(et.wouldEndOn) })
        : t('contracts.sub.requestedNoEnd', { date: day(et.requestedOn) });
    }
    case ContractDecision.ENDED_NO_DECISION:
      return t('contracts.sub.endedNoDecision', { date: day(c.endsOn) });
    default:
      if (c.toDeactivate) return t('contracts.sub.ended', { date: day(lastDayOf(c)) });
      return c.decidedBy && c.decidedAt
        ? t('contracts.sub.decidedBy', { name: c.decidedBy.name, when: formatDateTime(c.decidedAt, locale, { year: false }) })
        : null;
  }
}

/** The decision column: the pill, its tags (Early / Late / Calendar not set / To deactivate) and the sub line. */
export function DecisionCell({ contract }: { contract: Contract }) {
  const { t, locale } = useTranslation();
  const sub = decisionSubLine(contract, t, locale);
  const tags = decisionTags(contract);
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <ContractDecisionPill decision={contract.decision} />
        {tags.map((tag) => (
          <StatusPill
            key={tag}
            tone={tag === 'toDeactivate' ? 'neutral' : 'accent'}
            className={cn(tag === 'toDeactivate' && 'bg-foreground text-background')}
          >
            {t(`contracts.tags.${tag}`)}
          </StatusPill>
        ))}
      </span>
      {sub ? <span className="max-w-64 text-xs break-words whitespace-normal text-muted-foreground">{sub}</span> : null}
    </span>
  );
}

export function DecisionCellSkeleton() {
  return (
    <span className="flex flex-col items-start gap-1">
      <SkeletonPill />
      <SkeletonText className="text-xs" width="w-32" />
    </span>
  );
}

/** Avatar, the name (opens the profile) and `code · job title`. */
export function ContractEmployee({ contract }: { contract: Contract }) {
  const { locale } = useTranslation();
  const e = contract.employee;
  return (
    <span className="flex min-w-0 items-center gap-3">
      <PersonAvatar photoUrl={e.photoUrl} gender={e.gender} size="sm" muted={e.status !== 'ACTIVE'} />
      <EmployeeLink
        employeeId={e.id}
        name={localName(e, locale)}
        code={e.code}
        detail={localName(e.jobTitle, locale)}
        className="text-sm font-bold"
        wrapperClassName="whitespace-normal"
      />
    </span>
  );
}

export { SkeletonIdentity as ContractEmployeeSkeleton };

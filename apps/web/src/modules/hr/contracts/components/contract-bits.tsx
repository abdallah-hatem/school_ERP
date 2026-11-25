'use client';

import { ContractDecision, ContractPhase, ContractStatus, formatContractYear, lastDayOf, type Contract, type ContractDecision as Decision } from '@school-erp/shared';
import { EmployeeLink } from '@/core/employees';
import { PersonAvatar } from '@/shared/components/ui/person-avatar';
import { SkeletonIdentity, SkeletonPill } from '@/shared/components/ui/skeleton';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { SlotText, TEXT_SLOT } from '@/shared/components/ui/slot-text';
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

/** The not-renewing decision's note (the school's or the notice's), its typed text isolated. */
export function DecisionNote({ note, className }: { note: string | null; className?: string }) {
  const { t } = useTranslation();
  if (!note) return null;
  return (
    <span data-testid="decision-note" className={cn('text-xs break-words whitespace-normal text-muted-foreground', className)}>
      <SlotText text={t('contracts.sub.note', { note: TEXT_SLOT })} slot={<BidiText>{note}</BidiText>} />
    </span>
  );
}

/**
 * The decision column: the pill, its tags (From 2025/26 for a row carried over from an earlier
 * season, Early / Late / Calendar not set, To deactivate), the sub line and the decision's note.
 */
export function DecisionCell({ contract }: { contract: Contract }) {
  const { t, locale } = useTranslation();
  const sub = decisionSubLine(contract, t, locale);
  const tags = decisionTags(contract);
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <ContractDecisionPill decision={contract.decision} />
        {contract.carriedOver ? (
          <StatusPill tone="info" className="tabular" title={t('contracts.tags.from', { year: formatContractYear(contract.year) })}>
            <bdi>{t('contracts.tags.from', { year: formatContractYear(contract.year) })}</bdi>
          </StatusPill>
        ) : null}
        {contract.phase === ContractPhase.UPCOMING && contract.status !== ContractStatus.CANCELLED ? (
          <StatusPill tone="info">
            {t('contracts.history.upcoming', { date: formatDate(contract.startsOn, locale) })}
          </StatusPill>
        ) : null}
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
      <DecisionNote note={contract.note} className="max-w-64" />
    </span>
  );
}

/**
 * The decision as most rows read before the review: its pill alone. The line under it (who decided,
 * when, the note) is data — a pill and a line drew a 68px row for the usual 64px one (smoke,
 * 2026-11-25, rows held to ±2px).
 */
export function DecisionCellSkeleton() {
  return (
    <span className="flex flex-col items-start gap-1">
      <SkeletonPill />
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

import {
  CalendarTiming,
  ContractDecision,
  ContractStatus,
  decisionRefusal,
  EarlyTerminationStatus,
  ErrorCode,
  noticeWithdrawalRefusal,
  renewalRefusal,
  type Contract,
  type ContractState,
  type IsoDate,
  type RefusedRenewal,
} from '@school-erp/shared';
import type { StatusTone } from '@/shared/components/ui/status-pill';
import { apiErrorText } from '@/shared/lib/api-error';
import type { Locale, Translate } from '@/shared/lib/i18n';

/*
 * What a contract row shows and allows, worked out from the API's row (view only — the API
 * decides every write). Shared by the renewals table, the decision sheet and the employee's tab.
 */

/** Each decision's pill tone: red needs a decision now, amber is the employee's notice, green is renewed. */
export const DECISION_TONE: Record<ContractDecision, StatusTone> = {
  UNDECIDED: 'neutral',
  ENDED_NO_DECISION: 'danger',
  RENEWED: 'success',
  NOT_RENEWED_SCHOOL: 'danger',
  NOTICE: 'warning',
  EARLY_REQUESTED: 'info',
  ENDED_EARLY: 'neutral',
};

/** The rule's view of a row (`ContractState`, shared with the API). */
export function stateOf(c: Contract): ContractState {
  return {
    status: c.status,
    endsOn: c.endsOn,
    nonRenewalBy: c.nonRenewalBy,
    earlyTerminationStatus: c.earlyTermination?.status ?? null,
  };
}

/** The step the row needs next, as its one primary button (or none). */
export type NextAction = 'renew' | 'decideEarly' | 'deactivate' | null;

/**
 * Which of a row's actions the viewer gets. `manage`: `hr.contracts.manage`; `changeStatus`:
 * `hr.employees.change_status` (deactivating). Nobody acts on their own contract (§2) — the row
 * shows the reason instead.
 */
export interface ContractAbilities {
  /** Renewable now: shown as Renew and selectable for "Renew selected". */
  renew: boolean;
  /** Not renewing, the employee's notice or an early termination request can be recorded. */
  decide: boolean;
  approveOrReject: boolean;
  withdrawNotice: boolean;
  end: boolean;
  deactivate: boolean;
  /** The viewer's own contract: no action, with this said on the row. */
  own: boolean;
}

export function abilitiesOf(
  c: Contract,
  { manage, changeStatus, today }: { manage: boolean; changeStatus: boolean; today: IsoDate },
): ContractAbilities {
  const none: ContractAbilities = {
    renew: false,
    decide: false,
    approveOrReject: false,
    withdrawNotice: false,
    end: false,
    deactivate: false,
    own: c.ownContract,
  };
  if (c.ownContract) return none;
  const state = stateOf(c);
  const active = c.employee.status === 'ACTIVE';
  return {
    renew: manage && renewalRefusal(state, active) === null,
    decide: manage && decisionRefusal(state) === null,
    approveOrReject: manage && state.earlyTerminationStatus === EarlyTerminationStatus.REQUESTED,
    withdrawNotice: manage && noticeWithdrawalRefusal(state, today) === null,
    end:
      manage &&
      c.status !== ContractStatus.RENEWED &&
      c.status !== ContractStatus.ENDED_EARLY &&
      state.earlyTerminationStatus !== EarlyTerminationStatus.REQUESTED &&
      c.endsOn >= today,
    deactivate: changeStatus && c.toDeactivate,
    own: false,
  };
}

/** The row's one primary step: deactivate the ended, decide a waiting request, renew an open contract. */
export function nextAction(c: Contract, can: ContractAbilities): NextAction {
  if (can.deactivate) return 'deactivate';
  if (can.approveOrReject) return 'decideEarly';
  if (
    can.renew &&
    (c.decision === ContractDecision.UNDECIDED || c.decision === ContractDecision.ENDED_NO_DECISION)
  ) {
    return 'renew';
  }
  return null;
}

/** The tags after a row's pill: a notice or a request outside its window, and "To deactivate". */
export function decisionTags(c: Contract): ('EARLY' | 'LATE' | 'CALENDAR_NOT_SET' | 'toDeactivate')[] {
  const tags: ('EARLY' | 'LATE' | 'CALENDAR_NOT_SET' | 'toDeactivate')[] = [];
  const timing =
    c.decision === ContractDecision.NOTICE
      ? c.notice?.timing
      : c.decision === ContractDecision.EARLY_REQUESTED
        ? c.earlyTermination?.timing
        : undefined;
  if (timing && timing !== CalendarTiming.ON_TIME) tags.push(timing);
  if (c.toDeactivate) tags.push('toDeactivate');
  return tags;
}

/** The refused rows of a bulk renewal (409 `CONTRACTS_NOT_RENEWABLE`): `data` is the list, or `{ refused }`. */
export function refusedRows(res: { error?: unknown; data?: unknown }): RefusedRenewal[] {
  if (res.error !== ErrorCode.CONTRACTS_NOT_RENEWABLE) return [];
  const data = res.data as unknown;
  const list = Array.isArray(data) ? data : (data as { refused?: unknown } | null | undefined)?.refused;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (r): r is RefusedRenewal =>
      !!r && typeof (r as RefusedRenewal).contractId === 'string' && typeof (r as RefusedRenewal).code === 'string',
  );
}

/** A failed write in the screen's language (`errors.<CODE>` with its params), or `fallback`. */
export function contractError(
  res: { error?: unknown; message?: unknown; params?: unknown },
  i18n: { t: Translate; has: (key: string) => boolean; locale: Locale },
  fallback: string,
): string {
  return apiErrorText(res, i18n) || fallback;
}

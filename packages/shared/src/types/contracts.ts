import type { Gender } from '../enums';
import type { IsoDate, IsoDateTime, ListPage, NamedRef, PaginationQuery, Uuid } from './common';

/*
 * Contracts (§3 → Contracts, spec docs/specs/2026-11-24-contracts.md). One row per contract year
 * per employee, kept forever. The employee's `contractStart` / `contractEnd` are the current
 * contract, written only by the contracts service.
 *
 * A **contract year** is named by the year it starts: `2026` is 1 June 2026 – 31 May 2027 ("2026/27").
 */

/** A contract's stored status (spec → Rules, GUESS). */
export const ContractStatus = {
  /** Running (or ended with no decision yet: "Ended, no decision" on the renewal screen). */
  ACTIVE: 'ACTIVE',
  /** Next year's contract exists. */
  RENEWED: 'RENEWED',
  /** School's decision or the employee's notice: ends on its end date. */
  NOT_RENEWED: 'NOT_RENEWED',
  /** Early termination approved, or ended for another reason: ends on `endedOn`. */
  ENDED_EARLY: 'ENDED_EARLY',
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];
export const CONTRACT_STATUSES = Object.values(ContractStatus) as ContractStatus[];

/** Who decided a non-renewal: the school, or the employee's written notice. */
export const NonRenewalBy = { SCHOOL: 'SCHOOL', EMPLOYEE: 'EMPLOYEE' } as const;
export type NonRenewalBy = (typeof NonRenewalBy)[keyof typeof NonRenewalBy];
export const NON_RENEWAL_BY = Object.values(NonRenewalBy) as NonRenewalBy[];

/**
 * Where a dated request falls against the school calendar (spec edge cases 6, 7): inside its
 * window, before it (`EARLY`), after it (`LATE`), or the year's calendar isn't set.
 */
export const CalendarTiming = {
  ON_TIME: 'ON_TIME',
  EARLY: 'EARLY',
  LATE: 'LATE',
  CALENDAR_NOT_SET: 'CALENDAR_NOT_SET',
} as const;
export type CalendarTiming = (typeof CalendarTiming)[keyof typeof CalendarTiming];
export const CALENDAR_TIMINGS = Object.values(CalendarTiming) as CalendarTiming[];

/** An early termination request at the end of term 1 (spec → What it adds, 4). */
export const EarlyTerminationStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type EarlyTerminationStatus = (typeof EarlyTerminationStatus)[keyof typeof EarlyTerminationStatus];
export const EARLY_TERMINATION_STATUSES = Object.values(EarlyTerminationStatus) as EarlyTerminationStatus[];

/** Why a contract ended early (spec → What it adds, 5). `EARLY_TERMINATION` is set by an approval only. */
export const ContractEndReason = {
  ARTICLE_148: 'ARTICLE_148',
  RESIGNATION_BY_AGREEMENT: 'RESIGNATION_BY_AGREEMENT',
  DEATH: 'DEATH',
  OTHER: 'OTHER',
  EARLY_TERMINATION: 'EARLY_TERMINATION',
} as const;
export type ContractEndReason = (typeof ContractEndReason)[keyof typeof ContractEndReason];
/** The reasons `POST /hr/contracts/:id/end` accepts (an early termination ends through its approval). */
export const CONTRACT_END_REASONS = [
  ContractEndReason.ARTICLE_148,
  ContractEndReason.RESIGNATION_BY_AGREEMENT,
  ContractEndReason.DEATH,
  ContractEndReason.OTHER,
] as const;
export type ContractEndRequestReason = (typeof CONTRACT_END_REASONS)[number];

/**
 * The decision a row shows (worked out by the API from the status, the dates and today):
 * - `UNDECIDED` — active, not ended yet; `ENDED_NO_DECISION` — active, past its end;
 * - `RENEWED`; `NOT_RENEWED_SCHOOL`; `NOTICE` (the employee's notice);
 * - `EARLY_REQUESTED` — an early termination request waits for a decision;
 * - `ENDED_EARLY`.
 */
export const ContractDecision = {
  UNDECIDED: 'UNDECIDED',
  ENDED_NO_DECISION: 'ENDED_NO_DECISION',
  RENEWED: 'RENEWED',
  NOT_RENEWED_SCHOOL: 'NOT_RENEWED_SCHOOL',
  NOTICE: 'NOTICE',
  EARLY_REQUESTED: 'EARLY_REQUESTED',
  ENDED_EARLY: 'ENDED_EARLY',
} as const;
export type ContractDecision = (typeof ContractDecision)[keyof typeof ContractDecision];
export const CONTRACT_DECISIONS = Object.values(ContractDecision) as ContractDecision[];

/**
 * The renewal list's decision filter: one decision, or a tile's group — `OPEN` (not decided:
 * undecided or ended with no decision), `DECIDED` (every other), `TO_DEACTIVATE`.
 */
export const CONTRACT_DECISION_FILTERS = [...CONTRACT_DECISIONS, 'OPEN', 'DECIDED', 'TO_DEACTIVATE'] as const;
export type ContractDecisionFilter = (typeof CONTRACT_DECISION_FILTERS)[number];

/** The school calendar of one contract year (Settings → HR rules, spec → What it adds, 6). */
export interface SchoolCalendarDates {
  /** First day of term 1. */
  term1Start: IsoDate;
  /** Last day of term 1, exams included: an approved early termination ends here. */
  term1End: IsoDate;
  /** First day of term 2: the non-renewal window opens. */
  term2Start: IsoDate;
  /** The last day an employee's non-renewal notice is on time (30 April). */
  nonRenewalDeadline: IsoDate;
}

/** `GET /hr/settings/school-calendar/:year`. `calendar` null: not set for that year. */
export interface SchoolCalendar {
  /** The contract year (`2026` = 2026/27). */
  year: number;
  calendar: SchoolCalendarDates | null;
}

/** `PUT /hr/settings/school-calendar/:year` — all four, in order, inside the contract year. */
export type PutSchoolCalendarRequest = SchoolCalendarDates;

/** The person on a contract row. */
export interface ContractEmployee {
  id: Uuid;
  code: string;
  nameEn: string;
  nameAr: string;
  photoUrl: string | null;
  gender: Gender;
  /** ACTIVE / INACTIVE. */
  status: 'ACTIVE' | 'INACTIVE';
  stage: NamedRef & { isNoStage: boolean };
  jobTitle: NamedRef;
}

/** Who made a decision, and when. */
export interface ContractActor {
  id: Uuid;
  name: string;
}

export interface ContractNotice {
  receivedOn: IsoDate;
  timing: CalendarTiming;
  /** The scanned letter (`/files/contract-documents/…`), opened by whoever may see the contract. */
  fileUrl: string | null;
  note: string | null;
}

export interface ContractEarlyTermination {
  status: EarlyTerminationStatus;
  requestedOn: IsoDate;
  timing: CalendarTiming;
  note: string | null;
  fileUrl: string | null;
  /** The last day of term 1, when the calendar is set: where an approval ends the contract. */
  wouldEndOn: IsoDate | null;
  decidedBy: ContractActor | null;
  decidedAt: IsoDateTime | null;
  /** Required on a rejection. */
  rejectReason: string | null;
}

/** One contract (a renewal row, or one entry of an employee's history). */
export interface Contract {
  id: Uuid;
  employee: ContractEmployee;
  /** The contract year it ends in (`2026` = 2026/27): the renewal screen it appears on. */
  year: number;
  startsOn: IsoDate;
  /** The end it was signed with (31 May, or its own cycle's end, edge case 5). */
  endsOn: IsoDate;
  status: ContractStatus;
  decision: ContractDecision;
  /** Not renewed: who decided. */
  nonRenewalBy: NonRenewalBy | null;
  notice: ContractNotice | null;
  earlyTermination: ContractEarlyTermination | null;
  /** Ended early: the last day, the reason, the note and the attachment. */
  endedOn: IsoDate | null;
  endReason: ContractEndReason | null;
  endNote: string | null;
  endFileUrl: string | null;
  /** The renewal, not renewal or end: who decided, and when. */
  decidedBy: ContractActor | null;
  decidedAt: IsoDateTime | null;
  /** The renewal's contract (`RENEWED` only). */
  next: { id: Uuid; startsOn: IsoDate; endsOn: IsoDate } | null;
  /** Not renewed or ended, its last day passed, the employee still active (spec → Rules). */
  toDeactivate: boolean;
  /** The viewer's own contract: no action on it (OWN_CONTRACT, §2). */
  ownContract: boolean;
}

/** `GET /hr/contracts?year&decision&stageId&search&page&limit` — one contract year's renewal list. */
export interface ListContractsQuery extends PaginationQuery {
  /** The contract year (`2026` = 2026/27). Default: the current one (Cairo's today). */
  year?: number;
  decision?: ContractDecisionFilter;
  stageId?: Uuid;
}

/** The five tiles, over the whole year in the viewer's scope (not the search or filters). */
export interface ContractTotals {
  /** Every contract ending this contract year. */
  ending: number;
  /** Of every active contract, for "of N active contracts". */
  activeContracts: number;
  decided: number;
  renewing: number;
  notRenewing: number;
  open: number;
  endedNoDecision: number;
  notices: number;
  noticesEarly: number;
  noticesLate: number;
  toDeactivate: number;
}

/** The renewal list's answer (`data`): the page, the totals and the year's calendar. */
export interface ContractsPage extends ListPage<Contract> {
  year: number;
  totals: ContractTotals;
  /** The year's school calendar; null → the "calendar not set" banner (edge case 7). */
  calendar: SchoolCalendarDates | null;
}

/** `GET /hr/employees/:id/contracts?page&limit` — newest first. */
export type EmployeeContractsQuery = PaginationQuery;

/** `POST /hr/contracts/renew` — all or nothing (edge case 3). */
export interface RenewContractsRequest {
  contractIds: Uuid[];
}

/** `data` of a refused bulk renewal (409 `CONTRACTS_NOT_RENEWABLE`): each refused row and why. */
export interface RefusedRenewal {
  contractId: Uuid;
  code: string;
}

/** `POST /hr/contracts/:id/not-renewed`. EMPLOYEE needs `receivedOn`; the letter is optional. */
export interface NotRenewContractRequest {
  by: NonRenewalBy;
  receivedOn?: IsoDate;
  note?: string | null;
  /** A file uploaded with `POST /hr/contracts/:id/files`. */
  fileUrl?: string | null;
}

/** `POST /hr/contracts/:id/notice/withdraw`. */
export interface WithdrawNoticeRequest {
  reason: string;
}

/** `POST /hr/contracts/:id/early-termination`. */
export interface EarlyTerminationRequest {
  requestedOn: IsoDate;
  note?: string | null;
  fileUrl?: string | null;
}

/** `POST /hr/contracts/:id/early-termination/reject`. */
export interface RejectEarlyTerminationRequest {
  reason: string;
}

/** `POST /hr/contracts/:id/end` — today or later, not before the start, not after the end. */
export interface EndContractRequest {
  reason: ContractEndRequestReason;
  endsOn: IsoDate;
  note: string;
  fileUrl?: string | null;
}

/** `POST /hr/contracts/deactivate` — the "To deactivate" employees, all or nothing. */
export interface DeactivateContractsRequest {
  contractIds: Uuid[];
}

/** `POST /hr/contracts/:id/files` (multipart `file`) → where the letter is stored. */
export interface ContractFileUpload {
  fileUrl: string;
}

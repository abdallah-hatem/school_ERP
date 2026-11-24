import {
  contractDecision,
  contractPhase,
  contractYearOf,
  EmployeeStatus,
  isToDeactivate,
  type AuditLabel,
  type Contract,
  type SchoolCalendarDates,
} from '@school-erp/shared';
import { toIsoDate } from '../../../common/utils/dates.util';
import type { ContractRow } from './repositories/contracts.repository';

/*
 * Contracts as the API returns them and as the audit log stores them. Pure: rows in, shapes out.
 */

const day = (d: Date | null): string | null => (d ? toIsoDate(d) : null);

/** The audit entry's record label: the employee's two names. */
export function contractAuditLabel(row: Pick<ContractRow, 'employee'>): AuditLabel {
  return { en: row.employee.nameEn, ar: row.employee.nameAr };
}

/**
 * What the audit log stores about a contract: dates as `YYYY-MM-DD`, every decision field. Only the
 * fields that differ between two snapshots are kept (D7); a document as "attached" (its path is
 * never shown in the log).
 */
export function contractAuditSnapshot(row: ContractRow): Record<string, unknown> {
  return {
    startsOn: day(row.startsOn),
    endsOn: day(row.endsOn),
    status: row.status,
    nonRenewalBy: row.nonRenewalBy,
    noticeReceivedOn: day(row.noticeReceivedOn),
    noticeTiming: row.noticeTiming,
    note: row.note,
    earlyTermination: row.earlyTerminationStatus,
    earlyTerminationRequestedOn: day(row.earlyTerminationRequestedOn),
    earlyTerminationTiming: row.earlyTerminationTiming,
    endedOn: day(row.endedOn),
    endReason: row.endReason,
    reason: row.earlyTerminationRejectReason ?? row.endNote,
    document: row.noticeFileUrl || row.earlyTerminationFileUrl || row.endFileUrl ? 'file' : null,
    nextContract: row.nextContract ? `${day(row.nextContract.startsOn)} – ${day(row.nextContract.endsOn)}` : null,
  };
}

/** The school calendars a contract reads (`pickCalendar`): its notice window's and its early termination's. */
export interface ContractCalendars {
  notice: SchoolCalendarDates | null;
  earlyTermination: SchoolCalendarDates | null;
}

/**
 * The row as the API returns it on `today`. `actorEmployeeId`: the viewer's linked employee (their
 * own contract has no actions); `calendars`: the school calendars the contract reads (where an
 * early termination would end); `listedYear`: the renewal screen's year, when listed there (a row
 * of an earlier year is "carried over").
 */
export function toContract(
  row: ContractRow,
  today: string,
  actorEmployeeId: string | null,
  calendars: ContractCalendars,
  listedYear?: number,
): Contract {
  const endsOn = toIsoDate(row.endsOn);
  const endedOn = day(row.endedOn);
  const employeeActive = row.employee.status === EmployeeStatus.ACTIVE;
  return {
    id: row.id,
    employee: {
      id: row.employee.id,
      code: row.employee.code,
      nameEn: row.employee.nameEn,
      nameAr: row.employee.nameAr,
      photoUrl: row.employee.photoUrl,
      gender: row.employee.gender,
      status: row.employee.status,
      stage: row.employee.stage,
      jobTitle: row.employee.jobTitle,
    },
    year: contractYearOf(endsOn),
    startsOn: toIsoDate(row.startsOn),
    endsOn,
    status: row.status,
    phase: contractPhase({ status: row.status, startsOn: toIsoDate(row.startsOn), endsOn, endedOn }, today),
    decision: contractDecision(
      {
        status: row.status,
        endsOn,
        nonRenewalBy: row.nonRenewalBy,
        earlyTerminationStatus: row.earlyTerminationStatus,
      },
      today,
    ),
    nonRenewalBy: row.nonRenewalBy,
    note: row.note,
    notice: row.noticeReceivedOn
      ? {
          receivedOn: toIsoDate(row.noticeReceivedOn),
          timing: row.noticeTiming ?? 'CALENDAR_NOT_SET',
          fileUrl: row.noticeFileUrl,
          note: row.note,
        }
      : null,
    earlyTermination:
      row.earlyTerminationStatus && row.earlyTerminationRequestedOn
        ? {
            status: row.earlyTerminationStatus,
            requestedOn: toIsoDate(row.earlyTerminationRequestedOn),
            timing: row.earlyTerminationTiming ?? 'CALENDAR_NOT_SET',
            note: row.earlyTerminationNote,
            fileUrl: row.earlyTerminationFileUrl,
            wouldEndOn: row.earlyTerminationStatus === 'APPROVED' ? endedOn : (calendars.earlyTermination?.term1End ?? null),
            decidedBy: row.earlyTerminationDecidedBy,
            decidedAt: row.earlyTerminationDecidedAt?.toISOString() ?? null,
            rejectReason: row.earlyTerminationRejectReason,
          }
        : null,
    endedOn,
    endReason: row.endReason,
    endNote: row.endNote,
    endFileUrl: row.endFileUrl,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    next: row.nextContract
      ? { id: row.nextContract.id, startsOn: toIsoDate(row.nextContract.startsOn), endsOn: toIsoDate(row.nextContract.endsOn) }
      : null,
    toDeactivate: isToDeactivate({ status: row.status, endsOn, endedOn }, employeeActive, today),
    ownContract: actorEmployeeId !== null && actorEmployeeId === row.employeeId,
    carriedOver: listedYear !== undefined && contractYearOf(endsOn) < listedYear,
    calendars,
  };
}

/** The scope fields of a contract's employee (`inScope`). */
export function contractScopeFields(row: Pick<ContractRow, 'employee'>) {
  return {
    id: row.employee.id,
    stageId: row.employee.stage.id,
    managerId: row.employee.managerId,
    otherStageIds: row.employee.otherStages.map((s) => s.stageId),
  };
}

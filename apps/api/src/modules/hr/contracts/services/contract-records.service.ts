import { Injectable } from '@nestjs/common';
import { AuditEntityType, currentContractPeriod, type AuditAction, type IsoDate } from '@school-erp/shared';
import { AuditService } from '../../../../core/audit';
import { fromIsoDate, toIsoDate } from '../../../../common/utils/dates.util';
import { contractAuditLabel, contractAuditSnapshot } from '../contracts.pure';
import { ContractsRepository, type ContractRow, type EmployeeContractDates } from '../repositories/contracts.repository';

/**
 * The contract writes both the employees service and the contracts service need, with their audit
 * entry (§9) in the caller's transaction: a new employee's first contract (spec → "creation still
 * sets the first contract"). Kept apart from `ContractsService` so employees can use it without a
 * cycle (contracts deactivate employees through `EmployeesService`).
 */
@Injectable()
export class ContractRecords {
  constructor(
    private readonly repository: ContractsRepository,
    private readonly audit: AuditService,
  ) {}

  /** A new employee's first contract (active), recorded as `hr.contract.create`. */
  async createFirst(employeeId: string, startsOn: IsoDate, endsOn: IsoDate): Promise<ContractRow> {
    const row = await this.repository.create({
      employeeId,
      startsOn: fromIsoDate(startsOn),
      endsOn: fromIsoDate(endsOn),
    });
    await this.record('hr.contract.create', null, row);
    return row;
  }

  /**
   * Points the employee's contract start / end at the contract in force on `today`
   * (`currentContractPeriod`) — after every contract write, in its transaction. A renewal's next
   * contract, or a new one with a future start, doesn't take them before its first day.
   */
  async syncCurrentDates(employeeId: string, today: IsoDate): Promise<void> {
    const periods = await this.repository.periodsOfEmployee(employeeId);
    const current = currentContractPeriod(periods.map(toPeriod), today);
    if (current) await this.repository.setEmployeeContractDates(employeeId, current.startsOn, current.endsOn);
  }

  /**
   * The daily step (HR's reminders job, before its reminders; and once at start-up): every employee
   * whose record doesn't name the contract in force on `today` is moved to it — on 1 June a
   * renewal's next contract takes over. Idempotent: a second run, or a run after a missed day (or a
   * deploy on 1 June), writes only what differs. Race-safe: for each employee to move, their contract
   * rows are locked and re-read, and the dates change only if still what was read. Each move is one
   * audit entry on the employee (actor: the system), so their History shows it. Returns how many moved.
   */
  async syncAllCurrentDates(today: IsoDate): Promise<number> {
    let moved = 0;
    for (const snapshot of await this.repository.contractDatesOfAll()) {
      if (!target(snapshot, today)) continue;
      await this.repository.lockContractsOfEmployee(snapshot.id);
      const e = await this.repository.contractDatesOf(snapshot.id);
      const to = e ? target(e, today) : null;
      if (!e || !to) continue;
      const from = { start: toIsoDate(e.contractStart), end: toIsoDate(e.contractEnd) };
      if ((await this.repository.moveEmployeeContractDates(e.id, from, to)) === 0) continue;
      await this.audit.record({
        action: 'hr.employee.contract_dates_move',
        entity: { type: AuditEntityType.EMPLOYEE, id: e.id, label: { en: e.nameEn, ar: e.nameAr } },
        before: { contractStart: from.start, contractEnd: from.end },
        after: { contractStart: to.start, contractEnd: to.end },
      });
      moved += 1;
    }
    return moved;
  }

  /** One audit entry on the contract: the fields that differ between the two snapshots. */
  record(
    action: AuditAction,
    before: ContractRow | null,
    after: ContractRow,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    return this.audit.record({
      action,
      entity: { type: AuditEntityType.EMPLOYEE_CONTRACT, id: after.id, label: contractAuditLabel(after) },
      before: before ? contractAuditSnapshot(before) : null,
      after: { ...contractAuditSnapshot(after), ...extra },
    });
  }
}

/** Where the record's dates must move on `today`, or null when they already name the contract in force. */
function target(e: EmployeeContractDates, today: IsoDate): { start: IsoDate; end: IsoDate } | null {
  const current = currentContractPeriod(e.contracts.map(toPeriod), today);
  if (!current) return null;
  if (toIsoDate(e.contractStart) === current.startsOn && toIsoDate(e.contractEnd) === current.endsOn) return null;
  return { start: current.startsOn, end: current.endsOn };
}

const toPeriod = (c: { status: ContractRow['status']; startsOn: Date; endsOn: Date; endedOn: Date | null }) => ({
  status: c.status,
  startsOn: toIsoDate(c.startsOn),
  endsOn: toIsoDate(c.endsOn),
  endedOn: c.endedOn ? toIsoDate(c.endedOn) : null,
});

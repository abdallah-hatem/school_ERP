import { Injectable } from '@nestjs/common';
import { AuditEntityType, currentContractPeriod, type AuditAction, type IsoDate } from '@school-erp/shared';
import { AuditService } from '../../../../core/audit';
import { fromIsoDate, toIsoDate } from '../../../../common/utils/dates.util';
import { contractAuditLabel, contractAuditSnapshot } from '../contracts.pure';
import { ContractsRepository, type ContractRow } from '../repositories/contracts.repository';

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
   * The daily step (HR's reminders job, before its reminders): every employee whose record doesn't
   * name the contract in force on `today` is moved to it — on 1 June a renewal's next contract takes
   * over. Idempotent: a second run, or a run after a missed day, writes only what differs.
   * Returns how many records moved.
   */
  async syncAllCurrentDates(today: IsoDate): Promise<number> {
    let moved = 0;
    for (const e of await this.repository.contractDatesOfAll()) {
      const current = currentContractPeriod(e.contracts.map(toPeriod), today);
      if (!current) continue;
      if (toIsoDate(e.contractStart) === current.startsOn && toIsoDate(e.contractEnd) === current.endsOn) continue;
      await this.repository.setEmployeeContractDates(e.id, current.startsOn, current.endsOn);
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

const toPeriod = (c: { status: ContractRow['status']; startsOn: Date; endsOn: Date; endedOn: Date | null }) => ({
  status: c.status,
  startsOn: toIsoDate(c.startsOn),
  endsOn: toIsoDate(c.endsOn),
  endedOn: c.endedOn ? toIsoDate(c.endedOn) : null,
});

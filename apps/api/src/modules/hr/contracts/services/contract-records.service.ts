import { Injectable } from '@nestjs/common';
import { AuditEntityType, type AuditAction, type IsoDate } from '@school-erp/shared';
import { AuditService } from '../../../../core/audit';
import { fromIsoDate } from '../../../../common/utils/dates.util';
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

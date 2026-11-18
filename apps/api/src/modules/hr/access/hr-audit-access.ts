import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditEntityType, type PermissionKey } from '@school-erp/shared';
import { AuditRecordAccess, type VisibleRecords } from '../../../core/audit';
import { EmployeesService } from '../employees/services/employees.service';
import { PenaltyRecordsService } from '../penalties/services/penalty-records.service';
import { HrAccessService } from './hr-access.service';

/**
 * Tells the audit log which HR records the viewer may read (R5, P4), so Activity, its day totals,
 * its people picker and "Today at a glance" leave the rest out and a record's History answers 404
 * (edge case 3):
 * - an employee's entries need `hr.employees.view` covering them;
 * - a penalty's entries need `hr.penalties.view` covering its employee;
 * - a lateness month's entries list several employees' minutes, and a payroll run's entries their
 *   pay and adjustments, so they need `hr.lateness.view` / `hr.payroll.view` at scope `all` — a
 *   scoped viewer would otherwise read other people's figures in them.
 */
@Injectable()
export class HrAuditAccess implements OnModuleInit {
  constructor(
    private readonly audit: AuditRecordAccess,
    private readonly access: HrAccessService,
    private readonly employees: EmployeesService,
    private readonly penalties: PenaltyRecordsService,
  ) {}

  onModuleInit(): void {
    this.audit.register(AuditEntityType.EMPLOYEE, () => this.employees.idsInViewScope());
    this.audit.register(AuditEntityType.PENALTY, () => this.penalties.idsInViewScope());
    this.audit.register(AuditEntityType.LATENESS_MONTH, () => this.wholeSchoolOnly('hr.lateness.view'));
    this.audit.register(AuditEntityType.PAYROLL_RUN, () => this.wholeSchoolOnly('hr.payroll.view'));
  }

  /** Every record of the type at scope `all`; none otherwise. */
  private async wholeSchoolOnly(key: PermissionKey): Promise<VisibleRecords> {
    return (await this.access.scope(key)).kind === 'all' ? 'all' : [];
  }
}

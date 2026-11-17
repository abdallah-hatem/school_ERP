import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditEntityType } from '@school-erp/shared';
import { AuditRecordAccess } from '../../../core/audit';
import { EmployeesService } from '../employees/services/employees.service';
import { PenaltyRecordsService } from '../penalties/services/penalty-records.service';

/**
 * Tells the audit log which HR records the viewer may read (R5, P4): an employee's entries need
 * `hr.employees.view` covering them, a penalty's entries `hr.penalties.view` covering its employee.
 * Outside → left out of Activity, and the record's History answers 404 (edge case 3).
 */
@Injectable()
export class HrAuditAccess implements OnModuleInit {
  constructor(
    private readonly access: AuditRecordAccess,
    private readonly employees: EmployeesService,
    private readonly penalties: PenaltyRecordsService,
  ) {}

  onModuleInit(): void {
    this.access.register(AuditEntityType.EMPLOYEE, () => this.employees.idsInViewScope());
    this.access.register(AuditEntityType.PENALTY, () => this.penalties.idsInViewScope());
  }
}

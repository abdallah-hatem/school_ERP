import { Injectable } from '@nestjs/common';
import { AuditEntityType, HrListKey } from '@school-erp/shared';
import { AuditService } from '../../../../core/audit';
import { AfterCommit } from '../../../../database/transactions';
import { DepartmentsRepository } from '../repositories/departments.repository';
import { ListItemsService } from './list-items.service';

@Injectable()
export class DepartmentsService extends ListItemsService {
  constructor(repository: DepartmentsRepository, audit: AuditService, afterCommit: AfterCommit) {
    super(repository, audit, afterCommit, HrListKey.DEPARTMENTS, {
      type: AuditEntityType.DEPARTMENT,
      create: 'hr.department.create',
      update: 'hr.department.update',
    });
  }
}

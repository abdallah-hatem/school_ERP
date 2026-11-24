import { Injectable, type OnModuleInit } from '@nestjs/common';
import { FileFolders } from '../../../core/settings';
import { CONTRACT_DOCUMENT_FOLDER, ContractsService } from '../contracts/services/contracts.service';
import { EMPLOYEE_PHOTO_FOLDER, EmployeesService } from '../employees/services/employees.service';

/**
 * Tells core's file storage whose HR files are whose (docs/ARCHITECTURE.md → Security → Files
 * follow their record): an employee photo opens for whoever may see that employee
 * (`hr.employees.view` and its scope) and for the employee themselves; anyone else gets 404.
 * Contract documents (notice letters, requests, attachments) are a sensitive folder: they need
 * `hr.contracts.view` covering the contract's employee, and each opening is recorded
 * (`hr.contract.document_open`). A later one (investigations) registers the same way.
 */
@Injectable()
export class HrFileAccess implements OnModuleInit {
  constructor(
    private readonly folders: FileFolders,
    private readonly employees: EmployeesService,
    private readonly contracts: ContractsService,
  ) {}

  onModuleInit(): void {
    this.folders.register(EMPLOYEE_PHOTO_FOLDER, {
      owner: 'hr.employee',
      canOpen: (user, url) => this.employees.canOpenPhoto(user, url),
    });
    this.folders.register(CONTRACT_DOCUMENT_FOLDER, {
      owner: 'hr.employee_contract',
      permission: 'hr.contracts.view',
      canOpen: (user, url) => this.contracts.canOpenDocument(user, url),
      onOpen: (_user, url) => this.contracts.recordDocumentOpened(url),
    });
  }
}

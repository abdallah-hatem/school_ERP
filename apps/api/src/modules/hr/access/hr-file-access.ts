import { Injectable, type OnModuleInit } from '@nestjs/common';
import { FileFolders } from '../../../core/settings';
import { CONTRACT_COPY_FOLDER, ContractPrintService } from '../contracts/services/contract-print.service';
import { CONTRACT_DOCUMENT_FOLDER, ContractsService } from '../contracts/services/contracts.service';
import { EMPLOYEE_PHOTO_FOLDER, EmployeesService } from '../employees/services/employees.service';

/**
 * Tells core's file storage whose HR files are whose (docs/ARCHITECTURE.md → Security → Files
 * follow their record): an employee photo opens for whoever may see that employee
 * (`hr.employees.view` and its scope) and for the employee themselves; anyone else gets 404.
 * Contract documents (notice letters, requests, attachments) are a sensitive folder: they need
 * `hr.contracts.view` covering the contract's employee, and each opening is recorded
 * (`hr.contract.document_open`); printed copies the same, plus the salary for a copy that holds
 * one (`hr.contract.copy_open`). A later one (investigations) registers the same way.
 */
@Injectable()
export class HrFileAccess implements OnModuleInit {
  constructor(
    private readonly folders: FileFolders,
    private readonly employees: EmployeesService,
    private readonly contracts: ContractsService,
    private readonly print: ContractPrintService,
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
    // Printed contract copies (contract templates spec): the contract's view scope, plus the
    // employee's salary for a copy that holds one; each opening is `hr.contract.copy_open`.
    this.folders.register(CONTRACT_COPY_FOLDER, {
      owner: 'hr.employee_contract',
      permission: 'hr.contracts.view',
      canOpen: (user, url) => this.print.canOpenCopy(user, url),
      onOpen: (_user, url) => this.print.recordCopyOpened(url),
    });
  }
}

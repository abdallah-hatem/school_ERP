import { Injectable, type OnModuleInit } from '@nestjs/common';
import { FileFolders } from '../../../core/settings';
import { EMPLOYEE_PHOTO_FOLDER, EmployeesService } from '../employees/services/employees.service';

/**
 * Tells core's file storage whose HR files are whose (docs/ARCHITECTURE.md → Security → Files
 * follow their record): an employee photo opens for whoever may see that employee
 * (`hr.employees.view` and its scope) and for the employee themselves; anyone else gets 404.
 * A later sensitive HR folder (contracts, investigations) registers here too, with its extra
 * `permission` and an `onOpen` that records the opening.
 */
@Injectable()
export class HrFileAccess implements OnModuleInit {
  constructor(
    private readonly folders: FileFolders,
    private readonly employees: EmployeesService,
  ) {}

  onModuleInit(): void {
    this.folders.register(EMPLOYEE_PHOTO_FOLDER, {
      owner: 'hr.employee',
      canOpen: (user, url) => this.employees.canOpenPhoto(user, url),
    });
  }
}

import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  contractYearFor,
  Employee,
  EmployeeHiredEvent,
  EmployeeRef,
  EmployeeStatus,
  EmployeeSummary,
  ErrorCode,
  HrEvent,
  oneYearContractEnd,
  Paginated,
  Uuid,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { fromIsoDate, todayIsoDate, toIsoDate } from '../../../../common/utils/dates.util';
import { DepartmentsService } from '../../lists/services/departments.service';
import { JobTitlesService } from '../../lists/services/job-titles.service';
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from '../dto/employee.dto';
import {
  EmployeeDetailRow,
  EmployeesRepository,
  EmployeeSummaryRow,
  EmployeeUpdateData,
} from '../repositories/employees.repository';

/** Fields a PATCH may change but never clear (§3 "required"). */
const REQUIRED_FIELDS = [
  'nameEn',
  'nameAr',
  'gender',
  'dateOfBirth',
  'phone',
  'hireDate',
  'stageId',
  'departmentId',
  'jobTitleId',
  'workSystem',
  'basicSalary',
  'contractStart',
  'contractEnd',
  'usesBus',
] as const satisfies readonly (keyof UpdateEmployeeDto)[];

const DATE_FIELDS = ['dateOfBirth', 'hireDate', 'contractStart', 'contractEnd'] as const;

const bad = (code: ErrorCode) => new CodedException(HttpStatus.BAD_REQUEST, code);

export function toEmployeeSummary(row: EmployeeSummaryRow): EmployeeSummary {
  return { ...row };
}

export function toEmployee(row: EmployeeDetailRow): Employee {
  return {
    ...row,
    dateOfBirth: toIsoDate(row.dateOfBirth),
    hireDate: toIsoDate(row.hireDate),
    contractStart: toIsoDate(row.contractStart),
    contractEnd: toIsoDate(row.contractEnd),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * §3 employee records. Never deleted — deactivated. Codes come from the repository's counter.
 * Emits `employee.hired` / `employee.updated` / `employee.deactivated` after each write.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly repository: EmployeesRepository,
    private readonly departments: DepartmentsService,
    private readonly jobTitles: JobTitlesService,
    private readonly events: EventEmitter2,
  ) {}

  async list(query: ListEmployeesQueryDto): Promise<Paginated<EmployeeSummary>> {
    const result = await this.repository.list(query.page, query.limit, query.search, {
      departmentId: query.departmentId,
      stageId: query.stageId,
      status: query.status,
      workSystem: query.workSystem,
    });
    return { ...result, data: result.data.map(toEmployeeSummary) };
  }

  async get(id: Uuid): Promise<Employee> {
    const row = await this.repository.findDetail(id);
    if (!row) throw new NotFoundException();
    return toEmployee(row);
  }

  /** Every active employee, ordered by code — for month-wide lists (lateness, payroll). */
  listActiveRefs(): Promise<EmployeeRef[]> {
    return this.repository.findActiveRefs();
  }

  /**
   * Checks that every id is an existing, active employee (§3: inactive employees get no new
   * penalties or lateness entries). Unknown id → 400 `FOREIGN_KEY_VIOLATION`; inactive → 409
   * `EMPLOYEE_INACTIVE`. Unknown ids are reported before inactive ones.
   */
  async assertActive(ids: Uuid[]): Promise<void> {
    const unique = [...new Set(ids)];
    const states = new Map((await this.repository.findStates(unique)).map((s) => [s.id, s.status]));
    if (unique.some((id) => !states.has(id))) throw bad(ErrorCode.FOREIGN_KEY_VIOLATION);
    if (unique.some((id) => states.get(id) !== EmployeeStatus.ACTIVE)) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.EMPLOYEE_INACTIVE);
    }
  }

  async create(dto: CreateEmployeeDto): Promise<Employee> {
    await this.assertSelectable(dto);
    await this.assertUnique(dto, null);
    if (dto.managerId) await this.assertManager(null, dto.managerId);
    const contract = this.resolveContract(dto.contractStart, dto.contractEnd);

    const row = await this.repository.createWithCode({
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      nationalId: dto.nationalId ?? null,
      gender: dto.gender,
      dateOfBirth: fromIsoDate(dto.dateOfBirth),
      phone: dto.phone,
      email: dto.email ?? null,
      address: dto.address ?? null,
      hireDate: fromIsoDate(dto.hireDate),
      stageId: dto.stageId,
      departmentId: dto.departmentId,
      jobTitleId: dto.jobTitleId,
      managerId: dto.managerId ?? null,
      grade: dto.grade ?? null,
      workSystem: dto.workSystem,
      basicSalary: dto.basicSalary,
      fingerprintId: dto.fingerprintId ?? null,
      contractStart: fromIsoDate(contract.start),
      contractEnd: fromIsoDate(contract.end),
      usesBus: dto.usesBus ?? false,
    });
    this.emit(HrEvent.EMPLOYEE_HIRED, row.id);
    return toEmployee(row);
  }

  async update(id: Uuid, dto: UpdateEmployeeDto): Promise<Employee> {
    const current = await this.repository.findDetail(id);
    if (!current) throw new NotFoundException();

    const cleared = REQUIRED_FIELDS.filter((f) => dto[f] === null);
    if (cleared.length) throw new BadRequestException(`${cleared.join(', ')} cannot be empty`);

    // Only a newly chosen list item must be selectable — an item hidden after the employee got it
    // stays valid on unrelated edits.
    await this.assertSelectable({
      stageId: dto.stageId !== current.stage.id ? dto.stageId : undefined,
      departmentId: dto.departmentId !== current.department.id ? dto.departmentId : undefined,
      jobTitleId: dto.jobTitleId !== current.jobTitle.id ? dto.jobTitleId : undefined,
    });
    await this.assertUnique(dto, id);
    if (dto.managerId) await this.assertManager(id, dto.managerId);
    if (dto.contractStart !== undefined || dto.contractEnd !== undefined) {
      this.assertContractOrder(
        dto.contractStart ?? toIsoDate(current.contractStart),
        dto.contractEnd ?? toIsoDate(current.contractEnd),
      );
    }

    const data: EmployeeUpdateData = { ...dto };
    for (const f of DATE_FIELDS) {
      const v = dto[f];
      if (v) data[f] = fromIsoDate(v);
    }
    const row = await this.repository.updateEmployee(id, data);
    this.emit(HrEvent.EMPLOYEE_UPDATED, id);
    return toEmployee(row);
  }

  /** Inactive: kept with all history, left out of new payroll runs, penalties and lateness. */
  deactivate(id: Uuid): Promise<Employee> {
    return this.setStatus(id, EmployeeStatus.INACTIVE, HrEvent.EMPLOYEE_DEACTIVATED);
  }

  /** §3 GUESS: reactivating is allowed. */
  reactivate(id: Uuid): Promise<Employee> {
    return this.setStatus(id, EmployeeStatus.ACTIVE, HrEvent.EMPLOYEE_UPDATED);
  }

  /** Idempotent: setting the status an employee already has changes nothing and emits nothing. */
  private async setStatus(id: Uuid, status: EmployeeStatus, event: HrEvent): Promise<Employee> {
    const current = await this.repository.findState(id);
    if (!current) throw new NotFoundException();
    if (current.status === status) return this.get(id);
    const row = await this.repository.updateEmployee(id, { status });
    this.emit(event, id);
    return toEmployee(row);
  }

  private async assertSelectable(ids: {
    stageId?: string;
    departmentId?: string;
    jobTitleId?: string;
  }): Promise<void> {
    if (ids.stageId) {
      const stage = await this.repository.findStage(ids.stageId);
      if (!stage) throw bad(ErrorCode.FOREIGN_KEY_VIOLATION);
      if (!stage.isActive) throw bad(ErrorCode.LIST_ITEM_HIDDEN);
    }
    if (ids.departmentId) await this.departments.getSelectable(ids.departmentId);
    if (ids.jobTitleId) await this.jobTitles.getSelectable(ids.jobTitleId);
  }

  /** National ID and fingerprint ID are unique when given; keeping your own is fine. */
  private async assertUnique(
    dto: { nationalId?: string | null; fingerprintId?: string | null },
    selfId: Uuid | null,
  ): Promise<void> {
    if (dto.nationalId) {
      const owner = await this.repository.findIdByNationalId(dto.nationalId);
      if (owner && owner !== selfId) {
        throw new CodedException(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_NATIONAL_ID);
      }
    }
    if (dto.fingerprintId) {
      const owner = await this.repository.findIdByFingerprintId(dto.fingerprintId);
      if (owner && owner !== selfId) {
        throw new CodedException(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_FINGERPRINT_ID);
      }
    }
  }

  /**
   * The manager is another active employee, and choosing them must not close a loop: walking up
   * from the new manager must never reach this employee (A→B→A, A→B→C→A…).
   */
  private async assertManager(selfId: Uuid | null, managerId: Uuid): Promise<void> {
    if (managerId === selfId) throw bad(ErrorCode.INVALID_MANAGER);
    const manager = await this.repository.findState(managerId);
    if (!manager || manager.status !== EmployeeStatus.ACTIVE) throw bad(ErrorCode.INVALID_MANAGER);
    if (selfId && (await this.repository.managerChainIds(managerId)).includes(selfId)) {
      throw bad(ErrorCode.MANAGER_LOOP);
    }
  }

  /**
   * Contract defaults (§3 DECIDED): 1 June – 31 May of the current contract year. A start given
   * without an end gets a one-year contract from that start.
   */
  private resolveContract(start?: string, end?: string): { start: string; end: string } {
    const current = contractYearFor(todayIsoDate());
    const s = start ?? current.start;
    const e = end ?? (start ? oneYearContractEnd(start) : current.end);
    this.assertContractOrder(s, e);
    return { start: s, end: e };
  }

  private assertContractOrder(start: string, end: string): void {
    if (end <= start) throw new BadRequestException('contractEnd must be after contractStart');
  }

  private emit(event: HrEvent, employeeId: Uuid): void {
    const payload: EmployeeHiredEvent = { employeeId, at: new Date().toISOString() };
    this.events.emit(event, payload);
  }
}

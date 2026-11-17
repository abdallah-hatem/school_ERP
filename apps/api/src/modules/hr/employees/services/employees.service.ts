import { randomUUID } from 'node:crypto';
import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  applyInsuranceStatus,
  contractYearFor,
  Employee,
  EMPLOYEE_PHOTO_UPLOAD,
  EmployeeHiredEvent,
  EmployeeRef,
  EmployeeStatus,
  EmployeeSummary,
  ErrorCode,
  HrEvent,
  InsuranceStatus,
  NamedRef,
  oneYearContractEnd,
  Paginated,
  socialInsuranceIssues,
  type SocialInsurance,
  Uuid,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { checkImageUpload, FileStorageService, type UploadedFileLike } from '../../../../core/settings';
import { fromIsoDate, todayIsoDate, toIsoDate } from '../../../../common/utils/dates.util';
import { DepartmentsService } from '../../lists/services/departments.service';
import { JobTitlesService } from '../../lists/services/job-titles.service';
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from '../dto/employee.dto';
import {
  EmployeeDetailRow,
  EmployeesRepository,
  EmployeeSummaryRow,
  EmployeeUpdateData,
  PayrollSnapshotRow,
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
  'insuranceStatus',
] as const satisfies readonly (keyof UpdateEmployeeDto)[];

const DATE_FIELDS = ['dateOfBirth', 'hireDate', 'contractStart', 'contractEnd'] as const;

/** Folder under UPLOADS_DIR (and `/files/…`) holding employee photos — signed-in only. */
export const EMPLOYEE_PHOTO_FOLDER = 'employee-photos';

const bad = (code: ErrorCode) => new CodedException(HttpStatus.BAD_REQUEST, code);

export function toEmployeeSummary(row: EmployeeSummaryRow): EmployeeSummary {
  return { ...row };
}

export function toEmployee(row: EmployeeDetailRow): Employee {
  const { manager, ...rest } = row;
  return {
    ...rest,
    manager: manager
      ? {
          id: manager.id,
          code: manager.code,
          nameEn: manager.nameEn,
          nameAr: manager.nameAr,
          photoUrl: manager.photoUrl,
          managesPeople: manager.jobTitle.managesPeople,
        }
      : null,
    dateOfBirth: toIsoDate(row.dateOfBirth),
    hireDate: toIsoDate(row.hireDate),
    contractStart: toIsoDate(row.contractStart),
    contractEnd: toIsoDate(row.contractEnd),
    insuranceRegistrationDate: row.insuranceRegistrationDate
      ? toIsoDate(row.insuranceRegistrationDate)
      : null,
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
    private readonly files: FileStorageService,
  ) {}

  async list(query: ListEmployeesQueryDto): Promise<Paginated<EmployeeSummary>> {
    const result = await this.repository.list(query.page, query.limit, query.search, {
      departmentId: query.departmentId,
      stageId: query.stageId,
      status: query.status,
      workSystem: query.workSystem,
      managesPeople: query.managesPeople,
      excludeId: query.excludeId,
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

  /** Every active employee with their department, ordered by code (the lateness month). */
  async listActiveWithDepartments(): Promise<{ employee: EmployeeRef; department: NamedRef }[]> {
    const rows = await this.repository.findActiveWithDepartments();
    return rows.map(({ department, ...employee }) => ({ employee, department }));
  }

  /** Every active employee with the fields a payroll line snapshots (§6), by code. */
  listActiveForPayroll(): Promise<PayrollSnapshotRow[]> {
    return this.repository.findActiveForPayroll();
  }

  /** Active headcount, total and per stage (dashboard). Inactive employees never count. */
  async activeHeadcount(): Promise<{
    active: number;
    byStage: { stage: NamedRef; count: number }[];
  }> {
    const byStage = await this.repository.countActiveByStage();
    return { active: byStage.reduce((n, s) => n + s.count, 0), byStage };
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
    const insurance = this.resolveInsurance(dto, null);
    await this.assertUnique({ ...dto, insuranceNumber: insurance.insuranceNumber }, null);
    if (dto.managerId) await this.assertManager(null, dto.managerId, true);
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
      ...this.insuranceData(insurance),
      bankName: dto.bankName ?? null,
      bankAccountNumber: dto.bankAccountNumber ?? null,
      iban: dto.iban ?? null,
      emergencyContactName: dto.emergencyContactName ?? null,
      emergencyContactRelationship: dto.emergencyContactRelationship ?? null,
      emergencyContactPhone: dto.emergencyContactPhone ?? null,
      highestDegree: dto.highestDegree ?? null,
      major: dto.major ?? null,
      university: dto.university ?? null,
      graduationYear: dto.graduationYear ?? null,
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
    const insurance = this.resolveInsurance(dto, current);
    await this.assertUnique({ ...dto, insuranceNumber: insurance.insuranceNumber }, id);
    // The existing manager left unchanged is kept even if they no longer manage people (§3).
    if (dto.managerId) {
      await this.assertManager(id, dto.managerId, dto.managerId !== current.manager?.id);
    }
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
    Object.assign(data, this.insuranceData(insurance));
    const row = await this.repository.updateEmployee(id, data);
    this.emit(HrEvent.EMPLOYEE_UPDATED, id);
    return toEmployee(row);
  }

  /**
   * Replaces the employee's photo (§3): PNG, JPG or WebP up to 2 MB, checked by its bytes. The old
   * file is deleted once the record points at the new one.
   */
  async setPhoto(id: Uuid, file: UploadedFileLike | undefined): Promise<Employee> {
    const previous = await this.repository.findPhotoUrl(id);
    if (previous === undefined) throw new NotFoundException();
    const { type, buffer } = checkImageUpload(file, EMPLOYEE_PHOTO_UPLOAD);
    const photoUrl = await this.files.save(EMPLOYEE_PHOTO_FOLDER, `${id}-${randomUUID()}.${type}`, buffer);
    const row = await this.repository.updateEmployee(id, { photoUrl });
    if (previous) await this.files.remove(previous);
    this.emit(HrEvent.EMPLOYEE_UPDATED, id);
    return toEmployee(row);
  }

  /** Removes the photo; the employee shows the silhouette again. No photo → nothing changes. */
  async removePhoto(id: Uuid): Promise<Employee> {
    const previous = await this.repository.findPhotoUrl(id);
    if (previous === undefined) throw new NotFoundException();
    if (!previous) return this.get(id);
    const row = await this.repository.updateEmployee(id, { photoUrl: null });
    await this.files.remove(previous);
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
    dto: { nationalId?: string | null; fingerprintId?: string | null; insuranceNumber?: string | null },
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
    if (dto.insuranceNumber) {
      const owner = await this.repository.findIdByInsuranceNumber(dto.insuranceNumber);
      if (owner && owner !== selfId) {
        throw new CodedException(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_INSURANCE_NUMBER);
      }
    }
  }

  /**
   * The insurance fields after this request (§3): the request's values over the saved ones. While
   * insured, the number, registration date and insured salary are required (400 naming the first
   * missing one); not insured clears all three.
   */
  private resolveInsurance(
    dto: UpdateEmployeeDto,
    current: EmployeeDetailRow | null,
  ): SocialInsurance {
    const pick = <K extends keyof SocialInsurance>(key: K, saved: SocialInsurance[K]): SocialInsurance[K] =>
      dto[key] !== undefined ? (dto[key] as SocialInsurance[K]) : saved;
    const merged: SocialInsurance = {
      insuranceStatus: pick('insuranceStatus', current?.insuranceStatus ?? InsuranceStatus.NOT_INSURED),
      insuranceNumber: pick('insuranceNumber', current?.insuranceNumber ?? null),
      insuranceRegistrationDate: pick(
        'insuranceRegistrationDate',
        current?.insuranceRegistrationDate ? toIsoDate(current.insuranceRegistrationDate) : null,
      ),
      insuredSalary: pick('insuredSalary', current?.insuredSalary ?? null),
    };
    const [issue] = socialInsuranceIssues(merged, todayIsoDate());
    if (issue) {
      throw new BadRequestException(
        issue.issue === 'required'
          ? `${issue.field} is required when insured`
          : `${issue.field} is invalid (${issue.issue})`,
      );
    }
    return applyInsuranceStatus(merged);
  }

  private insuranceData(v: SocialInsurance) {
    return {
      insuranceStatus: v.insuranceStatus,
      insuranceNumber: v.insuranceNumber,
      insuranceRegistrationDate: v.insuranceRegistrationDate
        ? fromIsoDate(v.insuranceRegistrationDate)
        : null,
      insuredSalary: v.insuredSalary,
    };
  }

  /**
   * The manager is another active employee, and choosing them must not close a loop: walking up
   * from the new manager must never reach this employee (A→B→A, A→B→C→A…). A newly chosen
   * manager must also hold a job title that manages people (400 `MANAGER_NOT_MANAGING`, §3).
   */
  private async assertManager(
    selfId: Uuid | null,
    managerId: Uuid,
    newlyChosen: boolean,
  ): Promise<void> {
    if (managerId === selfId) throw bad(ErrorCode.INVALID_MANAGER);
    const manager = await this.repository.findManagerState(managerId);
    if (!manager || manager.status !== EmployeeStatus.ACTIVE) throw bad(ErrorCode.INVALID_MANAGER);
    if (newlyChosen && !manager.jobTitle.managesPeople) {
      throw bad(ErrorCode.MANAGER_NOT_MANAGING);
    }
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

import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditEntityType,
  applyInsuranceStatus,
  contractYearFor,
  defaultProbationEnd,
  Employee,
  EMPLOYEE_PHOTO_UPLOAD,
  EMPLOYEE_SALARY_FIELDS,
  EmployeeRef,
  EmployeeStatus,
  EmployeeSummary,
  ErrorCode,
  HrEvent,
  InsuranceStatus,
  isProbationEndValid,
  NamedRef,
  oneYearContractEnd,
  Paginated,
  type PermissionKey,
  schoolDayOf,
  socialInsuranceIssues,
  type SocialInsurance,
  Uuid,
  type AuditAction,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { AuditService } from '../../../../core/audit';
import { UsersService } from '../../../../core/users';
import { DomainEvents } from '../../../../core/events';
import { AfterCommit } from '../../../../database/transactions';
import type { UserScope } from '../../../../core/permissions';
import {
  inScope,
  toEmployeeScope,
  withoutFields,
  type EmployeeScope,
} from '../../access/employee-scope.pure';
import { HrAccessService } from '../../access/hr-access.service';
import { checkImageUpload, FileStorageService, type UploadedFileLike } from '../../../../core/settings';
import { fromIsoDate, todayIsoDate, toIsoDate } from '../../../../common/utils/dates.util';
import { DepartmentsService } from '../../lists/services/departments.service';
import { JobTitlesService } from '../../lists/services/job-titles.service';
import { HrRemindersService } from '../../reminders/hr-reminders.service';
import { HrSettingsService } from '../../settings/hr-settings.service';
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from '../dto/employee.dto';
import {
  EmployeeDetailRow,
  EmployeeScopeFields,
  EmployeesRepository,
  EmployeeSummaryRow,
  EmployeeUpdateData,
  PayrollSnapshotRow,
} from '../repositories/employees.repository';
import { changedEmployeeFields, employeeAuditLabel, employeeAuditSnapshot } from './employee-audit.pure';

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

const DATE_FIELDS = ['dateOfBirth', 'hireDate', 'contractStart', 'contractEnd', 'probationEnd'] as const;

/** Folder under UPLOADS_DIR (and `/files/…`) holding employee photos — signed-in only. */
export const EMPLOYEE_PHOTO_FOLDER = 'employee-photos';

const bad = (code: ErrorCode) => new CodedException(HttpStatus.BAD_REQUEST, code);

/** The scope fields of a detail row (its stage and manager come as references). */
const detailScopeFields = (row: EmployeeDetailRow): EmployeeScopeFields => ({
  id: row.id,
  stageId: row.stage.id,
  managerId: row.manager?.id ?? null,
  otherStageIds: row.otherStages.map((s) => s.stage.id),
});

/** "Also teaches in" as the API returns it: the stages themselves, in stage order. */
const otherStagesOf = (row: { otherStages: { stage: NamedRef }[] }): NamedRef[] =>
  row.otherStages.map((s) => s.stage);

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** A list row; `basicSalary` left out unless `salaryVisible` (R7). */
export function toEmployeeSummary(row: EmployeeSummaryRow, salaryVisible: boolean): EmployeeSummary {
  const { managerId: _managerId, otherStages: _otherStages, ...rest } = row;
  return {
    ...withoutFields(rest, ['basicSalary'], salaryVisible),
    otherStages: otherStagesOf(row),
    salaryVisible,
  };
}

/** The full record; the salary fields (`EMPLOYEE_SALARY_FIELDS`) left out unless `salaryVisible` (R7). */
export function toEmployee(row: EmployeeDetailRow, salaryVisible: boolean): Omit<Employee, 'signInAccount'> {
  const { manager, otherStages: _otherStages, ...rest } = row;
  return {
    ...withoutFields(rest, EMPLOYEE_SALARY_FIELDS, salaryVisible),
    otherStages: otherStagesOf(row),
    salaryVisible,
    manager: manager
      ? {
          id: manager.id,
          code: manager.code,
          nameEn: manager.nameEn,
          nameAr: manager.nameAr,
          photoUrl: manager.photoUrl,
          gender: manager.gender,
          managesPeople: manager.jobTitle.managesPeople,
        }
      : null,
    dateOfBirth: toIsoDate(row.dateOfBirth),
    hireDate: toIsoDate(row.hireDate),
    contractStart: toIsoDate(row.contractStart),
    contractEnd: toIsoDate(row.contractEnd),
    probationEnd: row.probationEnd ? toIsoDate(row.probationEnd) : null,
    insuranceRegistrationDate: row.insuranceRegistrationDate
      ? toIsoDate(row.insuranceRegistrationDate)
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * §3 employee records. Never deleted — deactivated. Codes come from the repository's counter.
 * Every write is recorded in the audit log in its transaction (`hr.employee.*`, §9) with the
 * changed fields. Publishes `hr.employee.hired` / `hr.employee.updated` (fire-and-forget) and
 * `hr.employee.deactivated` (must-deliver), always after the commit.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly repository: EmployeesRepository,
    private readonly departments: DepartmentsService,
    private readonly jobTitles: JobTitlesService,
    private readonly events: DomainEvents,
    private readonly files: FileStorageService,
    private readonly access: HrAccessService,
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
    private readonly hrSettings: HrSettingsService,
    private readonly reminders: HrRemindersService,
    private readonly users: UsersService,
  ) {}

  /** The employees `hr.employees.view` covers for the user (R5), salary per row (R7). */
  async list(query: ListEmployeesQueryDto): Promise<Paginated<EmployeeSummary>> {
    const [scope, salary] = await Promise.all([
      this.access.where('hr.employees.view'),
      this.access.salaryScope(),
    ]);
    const result = await this.repository.list(
      query.page,
      query.limit,
      query.search,
      {
        departmentId: query.departmentId,
        stageId: query.stageId,
        status: query.status,
        workSystem: query.workSystem,
        managesPeople: query.managesPeople,
        excludeId: query.excludeId,
      },
      scope,
    );
    return {
      ...result,
      data: result.data.map((row) =>
        toEmployeeSummary(
          row,
          inScope(salary, {
            ...row,
            stageId: row.stage.id,
            otherStageIds: row.otherStages.map((s) => s.stage.id),
          }),
        ),
      ),
    };
  }

  /** 404 when unknown or outside the user's `hr.employees.view` scope (edge case 3). */
  async get(id: Uuid): Promise<Employee> {
    const row = await this.repository.findDetail(id, await this.access.where('hr.employees.view'));
    if (!row) throw new NotFoundException();
    return this.present(row);
  }

  /**
   * 404 unless the employee exists and `key` covers them for the user (edge case 3) — for another
   * area's read about one employee (their payroll lines, penalties).
   */
  async assertInScope(key: PermissionKey, id: Uuid): Promise<void> {
    await this.access.assertInScope(key, await this.repository.findScopeFields(id));
  }

  /**
   * The employee's stages — main first, then "also teaches in" in stage order (§3, owner
   * 2026-11-21): the stages a penalty can be recorded in. Null for an unknown employee. No scope
   * check: the caller checks its own key first.
   */
  async stagesOf(id: Uuid): Promise<{ managerId: string | null; stages: NamedRef[] } | null> {
    const row = await this.repository.findDetailById(id);
    if (!row) return null;
    return { managerId: row.manager?.id ?? null, stages: [row.stage, ...otherStagesOf(row)] };
  }

  /** The ids of the employees `hr.employees.view` covers for the user (Activity log, R5). */
  async idsInViewScope(): Promise<Uuid[] | 'all'> {
    const scope = await this.access.scope('hr.employees.view');
    if (scope.kind === 'all') return 'all';
    return this.repository.findIdsInScope(await this.access.where('hr.employees.view'));
  }

  /** The employees whose code contains `q` (Activity's search: entries store names, not codes). */
  idsWithCode(q: string): Promise<Uuid[]> {
    return this.repository.findIdsByCode(q);
  }

  /**
   * The scope check that comes before any other check on a write keyed by employees (edge case 3):
   * a scoped user gets 404 for any id `key` doesn't cover — unknown, inactive or someone else's alike
   * — so no other answer tells them the employee exists. At scope `all` it lets every id through, and
   * the usual checks answer (unknown → 400, inactive → 409).
   */
  async assertScopeFirst(key: PermissionKey, ids: readonly Uuid[]): Promise<void> {
    const scope = await this.access.scope(key);
    if (scope.kind === 'all') return;
    const unique = [...new Set(ids)];
    const rows = await this.repository.findScopeFieldsMany(unique);
    const covered = new Set(rows.filter((row) => inScope(scope, row)).map((row) => row.id));
    if (unique.some((id) => !covered.has(id))) throw new NotFoundException();
  }

  /**
   * Whether the user sees every salary (`hr.employees.view_salary` at scope `all`, R7): what whole-
   * school money totals need. For other modules (accounting, §10), through HR's front door.
   */
  async seesEverySalary(): Promise<boolean> {
    return (await this.access.salaryScope()).kind === 'all';
  }

  /** Which of `ids` `key` covers for the user (unknown ids are left out). */
  async filterInScope(key: PermissionKey, ids: readonly Uuid[]): Promise<Set<Uuid>> {
    const [scope, rows] = await Promise.all([
      this.access.scope(key),
      this.repository.findScopeFieldsMany([...new Set(ids)]),
    ]);
    return new Set(rows.filter((row) => inScope(scope, row)).map((row) => row.id));
  }

  /**
   * Whether `scope` — someone else's, e.g. a notification recipient's (§11, N5) — covers each of
   * `ids`, in order. Unknown ids are not covered. Not the signed-in user's scope: no request needed.
   */
  async coveredBy(scope: UserScope, ids: readonly Uuid[]): Promise<boolean[]> {
    const employeeScope = toEmployeeScope(scope);
    const rows = new Map(
      (await this.repository.findScopeFieldsMany([...new Set(ids)])).map((row) => [row.id, row]),
    );
    return ids.map((id) => {
      const row = rows.get(id);
      return !!row && inScope(employeeScope, row);
    });
  }

  /** Every active employee, ordered by code — for month-wide lists (lateness, payroll). */
  listActiveRefs(): Promise<EmployeeRef[]> {
    return this.repository.findActiveRefs();
  }

  /**
   * Every active employee with their department, ordered by code (the lateness month). With `key`,
   * only the employees it covers for the user (R5); without, all of them (payroll's calculation).
   */
  async listActiveWithDepartments(
    key?: PermissionKey,
  ): Promise<{ employee: EmployeeRef; department: NamedRef }[]> {
    const rows = await this.repository.findActiveWithDepartments(
      key ? await this.access.where(key) : {},
    );
    return rows.map(({ department, ...employee }) => ({ employee, department }));
  }

  /** Every active employee with the fields a payroll line snapshots (§6), by code. */
  listActiveForPayroll(): Promise<PayrollSnapshotRow[]> {
    return this.repository.findActiveForPayroll();
  }

  /**
   * The bank details on file today for `ids`, by employee id (bank sheet, §6). No scope check: the
   * caller (the bank sheet) already requires every salary, which covers the bank details (§3, R7).
   */
  async bankDetailsFor(
    ids: readonly string[],
  ): Promise<Map<string, { bankName: string | null; bankAccountNumber: string | null; iban: string | null }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.repository.findBankDetails(ids);
    return new Map(rows.map(({ id, ...bank }) => [id, bank]));
  }

  /**
   * Active headcount, total and per stage (dashboard) — of the employees `hr.employees.view` covers
   * for the user (R5). Inactive employees never count.
   */
  async activeHeadcount(): Promise<{
    active: number;
    byStage: { stage: NamedRef; count: number }[];
  }> {
    const byStage = await this.repository.countActiveByStage(
      await this.access.where('hr.employees.view'),
    );
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
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      // A new employee's pay is set on create, so only someone who sees every salary may create (R7).
      if ((await this.access.salaryScope()).kind !== 'all') throw new ForbiddenException();
      await this.assertSelectable(dto);
      const insurance = this.resolveInsurance(dto, null);
      await this.assertUnique({ ...dto, insuranceNumber: insurance.insuranceNumber }, null);
      if (dto.managerId) {
        await this.assertManagerVisible(dto.managerId);
        await this.assertManager(null, dto.managerId, true);
      }
      const contract = this.resolveContract(dto.contractStart, dto.contractEnd);
      const probationEnd = await this.resolveProbationEnd(dto.hireDate, dto.probationEnd);
      const otherStageIds = await this.resolveOtherStages(dto.stageId, dto.otherStageIds ?? [], []);

      const created = await this.repository.createWithCode({
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
        probationEnd: probationEnd ? fromIsoDate(probationEnd) : null,
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
      const row = otherStageIds.length
        ? await this.writeOtherStages(created.id, otherStageIds)
        : created;
      await this.record('hr.employee.create', null, row);
      await this.events.publish(HrEvent.EMPLOYEE_HIRED, {
        employeeId: row.id,
        hireDate: toIsoDate(row.hireDate),
        at: new Date().toISOString(),
      });
      return this.present(row);
    });
  }

  /**
   * 404 outside the user's `hr.employees.edit` scope (edge case 3); 403 when the edit sends a
   * salary field (`EMPLOYEE_SALARY_FIELDS`) for an employee whose salary the user can't see (R7).
   */
  async update(id: Uuid, dto: UpdateEmployeeDto): Promise<Employee> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      const current = await this.repository.findDetail(id, await this.access.where('hr.employees.edit'));
      if (!current) throw new NotFoundException();
      const sendsSalary = EMPLOYEE_SALARY_FIELDS.some((f) => dto[f] !== undefined);
      if (sendsSalary && !inScope(await this.access.salaryScope(), detailScopeFields(current))) {
        throw new ForbiddenException();
      }

      const cleared = REQUIRED_FIELDS.filter((f) => dto[f] === null);
      if (cleared.length) throw new BadRequestException(`${cleared.join(', ')} cannot be empty`);
      await this.assertStaysInScope(current, dto);

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
      // §3: a changed hire date never moves the probation end, but both must stay in order.
      if (dto.hireDate !== undefined || dto.probationEnd !== undefined) {
        this.assertProbationOrder(
          dto.hireDate ?? toIsoDate(current.hireDate),
          dto.probationEnd !== undefined
            ? dto.probationEnd
            : current.probationEnd
              ? toIsoDate(current.probationEnd)
              : null,
        );
      }

      const currentOthers = current.otherStages.map((s) => s.stage.id);
      const otherStageIds = await this.resolveOtherStages(
        dto.stageId ?? current.stage.id,
        dto.otherStageIds,
        currentOthers,
      );

      const { otherStageIds: _otherStageIds, ...fields } = dto;
      const data: EmployeeUpdateData = { ...fields };
      for (const f of DATE_FIELDS) {
        const v = dto[f];
        if (v) data[f] = fromIsoDate(v);
      }
      Object.assign(data, this.insuranceData(insurance));
      let row = await this.repository.updateEmployee(id, data);
      if (!sameIds(otherStageIds, currentOthers)) row = await this.writeOtherStages(id, otherStageIds);
      // Always recorded: a save that changes nothing writes no entry but still answers `@Audited`.
      await this.record('hr.employee.update', current, row);
      // §11 (N3): a moved contract or probation end ends its open reminder; the daily job sends a
      // new one if the new date is inside a window.
      const day = (d: Date | null) => (d ? toIsoDate(d) : null);
      if (day(current.contractEnd) !== day(row.contractEnd)) await this.reminders.contractChanged(id);
      if (day(current.probationEnd) !== day(row.probationEnd)) await this.reminders.probationChanged(id);
      await this.publishUpdated(current, row);
      return this.present(row);
    });
  }

  /**
   * Replaces the employee's photo (§3): PNG, JPG or WebP up to 2 MB, checked by its bytes. The old
   * file is deleted once the record points at the new one.
   */
  async setPhoto(id: Uuid, file: UploadedFileLike | undefined): Promise<Employee> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      await this.assertInScope('hr.employees.edit', id);
      const before = await this.repository.findDetail(id);
      if (!before) throw new NotFoundException();
      const { type, buffer } = checkImageUpload(file, EMPLOYEE_PHOTO_UPLOAD);
      const photoUrl = await this.files.save(EMPLOYEE_PHOTO_FOLDER, `${id}-${randomUUID()}.${type}`, buffer);
      // Written before the commit: a rolled-back change deletes it again (no orphan file, gap 8).
      this.afterCommit.onRollback(() => this.files.remove(photoUrl));
      const row = await this.repository.updateEmployee(id, { photoUrl });
      await this.record('hr.employee.update', before, row);
      this.removeFileAfterCommit(before.photoUrl);
      await this.publishUpdated(before, row);
      return this.present(row);
    });
  }

  /** Removes the photo; the employee shows the silhouette again. No photo → nothing changes. */
  async removePhoto(id: Uuid): Promise<Employee> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      await this.assertInScope('hr.employees.edit', id);
      const before = await this.repository.findDetail(id);
      if (!before) throw new NotFoundException();
      if (!before.photoUrl) {
        // Nothing to remove: no entry, but the request still answers `@Audited`.
        await this.record('hr.employee.update', before, before);
        return this.present(before);
      }
      const row = await this.repository.updateEmployee(id, { photoUrl: null });
      await this.record('hr.employee.update', before, row);
      this.removeFileAfterCommit(before.photoUrl);
      await this.publishUpdated(before, row);
      return this.present(row);
    });
  }

  /** Inactive: kept with all history, left out of new payroll runs, penalties and lateness. */
  deactivate(id: Uuid): Promise<Employee> {
    return this.setStatus(id, EmployeeStatus.INACTIVE);
  }

  /** §3 GUESS: reactivating is allowed. */
  reactivate(id: Uuid): Promise<Employee> {
    return this.setStatus(id, EmployeeStatus.ACTIVE);
  }

  /**
   * Idempotent: setting the status an employee already has changes nothing, records no entry and
   * publishes nothing. Deactivating publishes `hr.employee.deactivated` (must-deliver: in the
   * outbox with this change); reactivating, `hr.employee.updated` with `status`.
   */
  private async setStatus(id: Uuid, status: EmployeeStatus): Promise<Employee> {
    // The change and its audit entry commit together (audit D2), for the seed too.
    return this.afterCommit.inTransaction(async () => {
      await this.assertInScope('hr.employees.change_status', id);
      const current = await this.repository.findDetail(id);
      if (!current) throw new NotFoundException();
      const action: AuditAction =
        status === EmployeeStatus.INACTIVE ? 'hr.employee.deactivate' : 'hr.employee.reactivate';
      if (current.status === status) {
        await this.record(action, current, current);
        return this.present(current);
      }
      // The day they left (the dashboard's leavers, §2), on the school's clock; cleared on return.
      const deactivatedOn = status === EmployeeStatus.INACTIVE ? fromIsoDate(schoolDayOf(new Date())) : null;
      const row = await this.repository.updateEmployee(id, { status, deactivatedOn });
      await this.record(action, current, row);
      if (status === EmployeeStatus.INACTIVE) {
        // §11 (N3): no reminder about an inactive employee stays open.
        await this.reminders.employeeDeactivated(id);
        await this.events.publish(
          HrEvent.EMPLOYEE_DEACTIVATED,
          { employeeId: id, at: new Date().toISOString() },
          { mustDeliver: true },
        );
      } else {
        await this.publishUpdated(current, row);
      }
      return this.present(row);
    });
  }

  /**
   * One audit entry about the employee, in the write's transaction (D2): the fields that differ
   * between the two snapshots (all of them on create). Equal snapshots write nothing.
   */
  private record(action: AuditAction, before: EmployeeDetailRow | null, after: EmployeeDetailRow): Promise<void> {
    return this.audit.record({
      action,
      entity: { type: AuditEntityType.EMPLOYEE, id: after.id, label: employeeAuditLabel(after) },
      before: before ? employeeAuditSnapshot(before) : null,
      after: employeeAuditSnapshot(after),
    });
  }

  /** A replaced photo's file goes only once the record no longer points at it (committed). */
  private removeFileAfterCommit(url: string | null): void {
    if (!url) return;
    void this.afterCommit.run(() => this.files.remove(url));
  }

  /** The record as this user may see it: salary fields only when their salary scope covers it. */
  /**
   * The record as the API returns it, with who signs in as this employee — read through core's
   * exported service (HR never reads the users table). Shown to whoever may see the employee; the
   * web links it to the user page only with `core.users.view`.
   */
  private async present(row: EmployeeDetailRow): Promise<Employee> {
    const [salary, signInAccount] = await Promise.all([this.access.salaryScope(), this.users.accountOfEmployee(row.id)]);
    return { ...toEmployee(row, this.salaryVisible(salary, row)), signInAccount };
  }

  private salaryVisible(salary: EmployeeScope, row: EmployeeDetailRow): boolean {
    return inScope(salary, detailScopeFields(row));
  }

  /**
   * R5 on edits: a new direct manager must be someone the user may see (else 400
   * `INVALID_MANAGER`, the answer an unknown manager gets), and a scoped editor can't move the
   * employee out of their own edit scope — to another stage (400 `FOREIGN_KEY_VIOLATION`, like an
   * unknown stage) or another manager's team (400 `INVALID_MANAGER`).
   */
  private async assertStaysInScope(current: EmployeeDetailRow, dto: UpdateEmployeeDto): Promise<void> {
    const managerChanges = dto.managerId !== undefined && dto.managerId !== (current.manager?.id ?? null);
    if (managerChanges && dto.managerId) await this.assertManagerVisible(dto.managerId);
    const edit = await this.access.scope('hr.employees.edit');
    if (edit.kind === 'all') return;
    const after = {
      id: current.id,
      stageId: dto.stageId ?? current.stage.id,
      managerId: dto.managerId !== undefined ? dto.managerId : (current.manager?.id ?? null),
      otherStageIds: dto.otherStageIds ?? current.otherStages.map((s) => s.stage.id),
    };
    if (inScope(edit, after)) return;
    throw bad(after.stageId !== current.stage.id ? ErrorCode.FOREIGN_KEY_VIOLATION : ErrorCode.INVALID_MANAGER);
  }

  /** A manager outside the user's `hr.employees.view` scope reads as unknown: 400 `INVALID_MANAGER`. */
  private async assertManagerVisible(managerId: Uuid): Promise<void> {
    const view = await this.access.scope('hr.employees.view');
    if (view.kind === 'all') return;
    const manager = await this.repository.findScopeFields(managerId);
    if (!manager || !inScope(view, manager)) throw bad(ErrorCode.INVALID_MANAGER);
  }

  /**
   * "Also teaches in" after this request (§3, owner 2026-11-21): `requested` (absent on an edit:
   * the current ones), never the main stage, each once, existing stages — a newly picked one must
   * be shown (a hidden one already held is kept, like the other lists). When an edit moves the main
   * stage onto one of the current other stages and doesn't send the list, it simply leaves the list.
   * 400 `INVALID_OTHER_STAGES` otherwise.
   */
  private async resolveOtherStages(
    mainStageId: string,
    requested: readonly string[] | undefined,
    current: readonly string[],
  ): Promise<string[]> {
    if (requested === undefined) return current.filter((id) => id !== mainStageId);
    const unique = new Set(requested);
    if (unique.size === 0) return [];
    if (unique.size !== requested.length || unique.has(mainStageId)) throw bad(ErrorCode.INVALID_OTHER_STAGES);
    const found = new Map((await this.repository.findStages([...unique])).map((s) => [s.id, s.isActive]));
    for (const id of unique) {
      if (!found.has(id)) throw bad(ErrorCode.INVALID_OTHER_STAGES);
      if (!found.get(id) && !current.includes(id)) throw bad(ErrorCode.INVALID_OTHER_STAGES);
    }
    return [...requested];
  }

  /** Writes the other stages and reads the record back with them. */
  private async writeOtherStages(id: Uuid, stageIds: readonly string[]): Promise<EmployeeDetailRow> {
    await this.repository.setOtherStages(id, stageIds);
    const row = await this.repository.findDetailById(id);
    if (!row) throw new NotFoundException();
    return row;
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

  /**
   * A new employee's probation end (§3, N0): the one given, else hire date + the school's default
   * probation length (`hr.employees.defaultProbationMonths`; 0 → none). On or after the hire date.
   */
  private async resolveProbationEnd(hireDate: string, given?: string | null): Promise<string | null> {
    const end = given ?? defaultProbationEnd(hireDate, await this.hrSettings.defaultProbationMonths());
    this.assertProbationOrder(hireDate, end);
    return end;
  }

  private assertProbationOrder(hireDate: string, probationEnd: string | null): void {
    if (!isProbationEndValid(hireDate, probationEnd)) throw bad(ErrorCode.PROBATION_BEFORE_HIRE);
  }

  /** `hr.employee.updated` after the commit — only when a field really changed (fire-and-forget). */
  private async publishUpdated(before: EmployeeDetailRow, after: EmployeeDetailRow): Promise<void> {
    const fields = changedEmployeeFields(before, after);
    if (fields.length === 0) return;
    await this.events.publish(HrEvent.EMPLOYEE_UPDATED, {
      employeeId: after.id,
      fields,
      at: new Date().toISOString(),
    });
  }
}

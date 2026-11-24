import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  calendarYearOfContract,
  CalendarTiming,
  CONTRACT_DOCUMENT_UPLOAD,
  ContractEndReason,
  contractYearOf,
  contractYearRange,
  ContractStatus,
  decisionRefusal,
  EarlyTerminationStatus,
  earlyTerminationTiming,
  endRefusal,
  ErrorCode,
  isToDeactivate,
  lockedMonthCutBy,
  NonRenewalBy,
  noticeTiming,
  noticeWithdrawalRefusal,
  notificationDedupeKey,
  PAGINATION,
  renewalRefusal,
  renewedContractDates,
  type AuthUser,
  type Contract,
  type ContractFileUpload,
  type ContractsPage,
  type EndContractRequest,
  type IsoDate,
  type Paginated,
  type RefusedRenewal,
  type SchoolCalendarDates,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { fromIsoDate, todayIsoDate, toIsoDate } from '../../../../common/utils/dates.util';
import { AuditService } from '../../../../core/audit';
import { NotificationsService } from '../../../../core/notifications';
import { checkDocumentUpload, FileStorageService, type UploadedFileLike } from '../../../../core/settings';
import { AfterCommit } from '../../../../database/transactions';
import { inScope, type EmployeeScope } from '../../access/employee-scope.pure';
import { HrAccessService } from '../../access/hr-access.service';
import { EmployeesService } from '../../employees/services/employees.service';
import { MonthLockService } from '../../month-lock/month-lock.service';
import { HrRemindersService } from '../../reminders/hr-reminders.service';
import { contractAuditLabel, contractScopeFields, toContract } from '../contracts.pure';
import type {
  EarlyTerminationDto,
  EmployeeContractsQueryDto,
  ListContractsQueryDto,
  NotRenewContractDto,
} from '../dto/contracts.dto';
import { ContractsRepository, type ContractRow } from '../repositories/contracts.repository';
import { ContractRecords } from './contract-records.service';
import { SchoolCalendarService } from './school-calendar.service';

/** Folder under UPLOADS_DIR (and `/files/…`) holding contract documents — a sensitive folder. */
export const CONTRACT_DOCUMENT_FOLDER = 'contract-documents';

const VIEW = 'hr.contracts.view' as const;

/** The HTTP status each refusal code answers with. */
function refusal(code: ErrorCode): CodedException {
  const status =
    code === ErrorCode.OWN_CONTRACT
      ? HttpStatus.FORBIDDEN
      : code === ErrorCode.CONTRACT_END_DATE_INVALID
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.CONFLICT;
  return new CodedException(status, code);
}

/**
 * Contracts (§3 → Contracts, spec docs/specs/2026-11-24-contracts.md): the history, the renewal
 * season, notices, early termination and ending a contract. Every write:
 * - runs in the request's transaction, after **locking the contract rows** (edge case 4);
 * - is refused on the actor's **own contract** (403 `OWN_CONTRACT`, §2 — a System admin too), and
 *   needs a linked account to tell (`ACCOUNT_NOT_LINKED`);
 * - writes the employee's current contract dates when they move (the only writer, edge case 13);
 * - is one audit entry on the contract (§9), and resolves or sends its notifications (§11).
 * Reads go through `hr.contracts.view` and its scope; a contract outside it is not found (edge 12).
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly repository: ContractsRepository,
    private readonly records: ContractRecords,
    private readonly calendars: SchoolCalendarService,
    private readonly access: HrAccessService,
    private readonly employees: EmployeesService,
    private readonly monthLock: MonthLockService,
    private readonly reminders: HrRemindersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly files: FileStorageService,
    private readonly afterCommit: AfterCommit,
  ) {}

  /** The school's today (Cairo). A test fixes it. */
  today(): IsoDate {
    return todayIsoDate();
  }

  // ── reads ──────────────────────────────────────────────────────────────────

  /** One contract year's renewal list with its tiles and calendar (spec → Screens). */
  async list(query: ListContractsQueryDto): Promise<ContractsPage> {
    const today = this.today();
    const year = query.year ?? contractYearOf(today);
    const { start, end } = contractYearRange(year);
    const page = query.page ?? PAGINATION.defaultPage;
    const limit = query.limit ?? PAGINATION.defaultLimit;
    const scope = await this.access.scope(VIEW);
    const [{ rows, total }, totals, calendar] = await Promise.all([
      this.repository.listPage(
        { from: start, to: end, today, decision: query.decision, stageId: query.stageId, search: query.search },
        scope,
        page,
        limit,
      ),
      this.repository.totals(start, end, today, scope),
      this.calendars.dates(year),
    ]);
    return { items: await this.present(rows), total, page, limit, year, totals, calendar };
  }

  /** One employee's contracts, newest first. 404 outside the viewer's scope (edge case 12). */
  async employeeContracts(employeeId: string, query: EmployeeContractsQueryDto): Promise<Paginated<Contract>> {
    await this.employees.assertInScope(VIEW, employeeId);
    const page = query.page ?? PAGINATION.defaultPage;
    const limit = query.limit ?? PAGINATION.defaultLimit;
    const { rows, total } = await this.repository.listOfEmployee(employeeId, page, limit);
    return {
      data: await this.present(rows),
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }

  // ── renewal ────────────────────────────────────────────────────────────────

  /**
   * Renews contracts, all or nothing (edge case 3): each gets next year's contract — from the day
   * after its end, for one year, keeping its own cycle (edge case 5) — and becomes RENEWED. Under
   * the rows' locks, so of two HR users renewing at once the second finds it renewed (edge case 4).
   * Refused rows: one contract → its own code; several → 409 `CONTRACTS_NOT_RENEWABLE` listing them.
   */
  async renew(contractIds: readonly string[]): Promise<Contract[]> {
    return this.afterCommit.inTransaction(async () => {
      const ids = [...new Set(contractIds)];
      const rows = await this.loadForWrite(ids, { ownAsRefusal: ids.length > 1 });
      const actor = await this.access.actor();
      const refused: RefusedRenewal[] = [];
      for (const row of rows) {
        const own = actor?.employeeId === row.employeeId;
        const code = own
          ? ErrorCode.OWN_CONTRACT
          : renewalRefusal(row, row.employee.status === 'ACTIVE');
        if (code) refused.push({ contractId: row.id, code });
      }
      if (refused.length > 0) {
        if (ids.length === 1) throw refusal(refused[0].code as ErrorCode);
        throw CodedException.withData(
          HttpStatus.CONFLICT,
          ErrorCode.CONTRACTS_NOT_RENEWABLE,
          { count: refused.length },
          refused,
        );
      }
      const renewed: ContractRow[] = [];
      for (const row of rows) {
        const next = renewedContractDates(toIsoDate(row.endsOn));
        // The old one leaves ACTIVE first: one active contract per employee (partial unique index).
        await this.repository.update(row.id, {
          status: ContractStatus.RENEWED,
          decidedById: actor?.userId ?? null,
          decidedAt: new Date(),
        });
        const created = await this.records.createFirst(row.employeeId, next.startsOn, next.endsOn);
        const after = await this.repository.update(row.id, { nextContractId: created.id });
        await this.repository.setEmployeeContractDates(row.employeeId, next.startsOn, next.endsOn);
        await this.records.record('hr.contract.renew', row, after);
        // §11: a renewal decision ends its "contract ends soon" reminder.
        await this.reminders.contractChanged(row.employeeId, actor?.userId ?? null);
        renewed.push(after);
      }
      return this.present(renewed);
    });
  }

  /**
   * Not renewing: the school's decision, or the employee's written notice (`receivedOn`, the
   * scanned letter). A notice outside the window is recorded and marked Early / Late (edge case
   * 6); without the year's calendar, "calendar not set" (edge case 7). The contract still ends on
   * its end date.
   */
  async notRenew(id: string, dto: NotRenewContractDto): Promise<Contract> {
    return this.afterCommit.inTransaction(async () => {
      const [row] = await this.loadForWrite([id]);
      const code = decisionRefusal(row);
      if (code) throw refusal(code);
      if (dto.fileUrl) await this.assertOwnDocument(id, dto.fileUrl);
      const actor = await this.access.actor();
      const byEmployee = dto.by === NonRenewalBy.EMPLOYEE;
      const timing = byEmployee
        ? noticeTiming(dto.receivedOn!, await this.calendarOf(row))
        : null;
      const after = await this.repository.update(id, {
        status: ContractStatus.NOT_RENEWED,
        nonRenewalBy: dto.by,
        noticeReceivedOn: byEmployee ? fromIsoDate(dto.receivedOn!) : null,
        noticeTiming: timing,
        noticeFileUrl: byEmployee ? (dto.fileUrl ?? null) : null,
        note: dto.note ?? null,
        decidedById: actor?.userId ?? null,
        decidedAt: new Date(),
      });
      if (byEmployee) {
        await this.records.record('hr.contract.notice_record', row, after);
        // The route's own action: the notice's entry above already says everything (no second entry).
        await this.records.record('hr.contract.not_renew', after, after);
      } else {
        await this.records.record('hr.contract.not_renew', row, after);
      }
      await this.reminders.contractChanged(row.employeeId, actor?.userId ?? null);
      return this.presentOne(after);
    });
  }

  /** Withdraws the employee's notice while the contract still runs (spec → Rules): active again. */
  async withdrawNotice(id: string, reason: string): Promise<Contract> {
    return this.afterCommit.inTransaction(async () => {
      const [row] = await this.loadForWrite([id]);
      const code = noticeWithdrawalRefusal(
        { status: row.status, nonRenewalBy: row.nonRenewalBy, endsOn: toIsoDate(row.endsOn) },
        this.today(),
      );
      if (code) throw refusal(code);
      const after = await this.repository.update(id, {
        status: ContractStatus.ACTIVE,
        nonRenewalBy: null,
        noticeReceivedOn: null,
        noticeTiming: null,
        noticeFileUrl: null,
        note: null,
        decidedById: null,
        decidedAt: null,
      });
      await this.records.record('hr.contract.notice_withdraw', row, after, { reason });
      return this.presentOne(after);
    });
  }

  // ── early termination ──────────────────────────────────────────────────────

  /**
   * Records the employee's request to end at the end of term 1 (spec → What it adds, 4): from the
   * first day of term 1 to its last (OPEN, default) — otherwise 409
   * `EARLY_TERMINATION_OUTSIDE_WINDOW`; without the calendar it is recorded, marked (edge case 7).
   * A new request may follow a rejected one (edge case 8). Tells whoever may manage contracts.
   */
  async requestEarlyTermination(id: string, dto: EarlyTerminationDto): Promise<Contract> {
    return this.afterCommit.inTransaction(async () => {
      const [row] = await this.loadForWrite([id]);
      const code = decisionRefusal(row);
      if (code) throw refusal(code);
      const timing = earlyTerminationTiming(dto.requestedOn, await this.calendarOf(row));
      if (timing === CalendarTiming.EARLY || timing === CalendarTiming.LATE) {
        throw refusal(ErrorCode.EARLY_TERMINATION_OUTSIDE_WINDOW);
      }
      if (dto.fileUrl) await this.assertOwnDocument(id, dto.fileUrl);
      const actor = await this.access.actor();
      const after = await this.repository.update(id, {
        earlyTerminationStatus: EarlyTerminationStatus.REQUESTED,
        earlyTerminationRequestedOn: fromIsoDate(dto.requestedOn),
        earlyTerminationTiming: timing,
        earlyTerminationNote: dto.note ?? null,
        earlyTerminationFileUrl: dto.fileUrl ?? null,
        earlyTerminationDecidedById: null,
        earlyTerminationDecidedAt: null,
        earlyTerminationRejectReason: null,
      });
      await this.records.record('hr.contract.early_termination_request', row, after);
      await this.notifications.notify({
        type: 'hr.contract.early_termination_waiting',
        subject: { entityType: AuditEntityType.EMPLOYEE_CONTRACT, entityId: id, employeeId: row.employeeId },
        dedupeKey: notificationDedupeKey('hr.contract.early_termination_waiting', id, randomUUID()),
        params: { employee: contractAuditLabel(row), date: dto.requestedOn },
        actorId: actor?.userId ?? null,
      });
      return this.presentOne(after);
    });
  }

  /**
   * Approves the waiting request: the contract ends on the last day of term 1 (exams included).
   * Needs the year's calendar (409 `SCHOOL_CALENDAR_NOT_SET`); a rejected request can't be
   * approved (edge case 8, `EARLY_TERMINATION_NOT_PENDING`); the end can't cut into an approved
   * payroll month (edge case 9).
   */
  async approveEarlyTermination(id: string): Promise<Contract> {
    return this.afterCommit.inTransaction(async () => {
      const [row] = await this.loadForWrite([id]);
      this.assertPendingRequest(row);
      const calendar = await this.calendarOf(row);
      if (!calendar) throw refusal(ErrorCode.SCHOOL_CALENDAR_NOT_SET);
      const endsOn = calendar.term1End;
      if (endsOn < toIsoDate(row.startsOn) || endsOn > toIsoDate(row.endsOn)) {
        throw refusal(ErrorCode.CONTRACT_END_DATE_INVALID);
      }
      await this.assertPaidMonthsStand(endsOn);
      const actor = await this.access.actor();
      const now = new Date();
      const after = await this.repository.update(id, {
        status: ContractStatus.ENDED_EARLY,
        earlyTerminationStatus: EarlyTerminationStatus.APPROVED,
        earlyTerminationDecidedById: actor?.userId ?? null,
        earlyTerminationDecidedAt: now,
        endedOn: fromIsoDate(endsOn),
        endReason: ContractEndReason.EARLY_TERMINATION,
        decidedById: actor?.userId ?? null,
        decidedAt: now,
      });
      await this.repository.setEmployeeContractDates(row.employeeId, toIsoDate(row.startsOn), endsOn);
      await this.records.record('hr.contract.early_termination_approve', row, after);
      await this.resolveRequest(id, 'approved', actor?.userId ?? null);
      await this.reminders.employeeDeactivated(row.employeeId, actor?.userId ?? null);
      return this.presentOne(after);
    });
  }

  /** Rejects the waiting request, with a reason. Final: a new request is needed (edge case 8). */
  async rejectEarlyTermination(id: string, reason: string): Promise<Contract> {
    return this.afterCommit.inTransaction(async () => {
      const [row] = await this.loadForWrite([id]);
      this.assertPendingRequest(row);
      const actor = await this.access.actor();
      const after = await this.repository.update(id, {
        earlyTerminationStatus: EarlyTerminationStatus.REJECTED,
        earlyTerminationDecidedById: actor?.userId ?? null,
        earlyTerminationDecidedAt: new Date(),
        earlyTerminationRejectReason: reason,
      });
      await this.records.record('hr.contract.early_termination_reject', row, after);
      await this.resolveRequest(id, 'rejected', actor?.userId ?? null);
      return this.presentOne(after);
    });
  }

  // ── ending ─────────────────────────────────────────────────────────────────

  /**
   * Ends a contract for another reason (Article 148, resignation by agreement, death, other): a
   * date from today, within the contract, a note, an optional attachment. The paid months stand
   * (edge case 9). The employee's future reminders go away (edge case 10).
   */
  async end(id: string, dto: EndContractRequest): Promise<Contract> {
    return this.afterCommit.inTransaction(async () => {
      const [row] = await this.loadForWrite([id]);
      const code = endRefusal(
        {
          status: row.status,
          startsOn: toIsoDate(row.startsOn),
          endsOn: toIsoDate(row.endsOn),
          earlyTerminationStatus: row.earlyTerminationStatus,
        },
        dto.endsOn,
        this.today(),
      );
      if (code) throw refusal(code);
      await this.assertPaidMonthsStand(dto.endsOn);
      if (dto.fileUrl) await this.assertOwnDocument(id, dto.fileUrl);
      const actor = await this.access.actor();
      const after = await this.repository.update(id, {
        status: ContractStatus.ENDED_EARLY,
        endedOn: fromIsoDate(dto.endsOn),
        endReason: dto.reason,
        endNote: dto.note,
        endFileUrl: dto.fileUrl ?? null,
        decidedById: actor?.userId ?? null,
        decidedAt: new Date(),
      });
      await this.repository.setEmployeeContractDates(row.employeeId, toIsoDate(row.startsOn), dto.endsOn);
      await this.records.record('hr.contract.end', row, after);
      await this.reminders.employeeDeactivated(row.employeeId, actor?.userId ?? null);
      return this.presentOne(after);
    });
  }

  /**
   * Deactivates the "To deactivate" employees (spec → Rules): not renewed or ended, the last day
   * passed, still active. All or nothing (409 `CONTRACT_NOT_TO_DEACTIVATE`). Each through the
   * employees service (its own checks, entry and event).
   */
  async deactivate(contractIds: readonly string[]): Promise<{ deactivated: number }> {
    return this.afterCommit.inTransaction(async () => {
      const ids = [...new Set(contractIds)];
      const rows = await this.loadForWrite(ids, { ownAsRefusal: false, own: false });
      const today = this.today();
      const stale = rows.filter(
        (r) =>
          !isToDeactivate(
            { status: r.status, endsOn: toIsoDate(r.endsOn), endedOn: r.endedOn ? toIsoDate(r.endedOn) : null },
            r.employee.status === 'ACTIVE',
            today,
          ),
      );
      if (stale.length > 0) throw refusal(ErrorCode.CONTRACT_NOT_TO_DEACTIVATE);
      const employees = [...new Set(rows.map((r) => r.employeeId))];
      for (const employeeId of employees) await this.employees.deactivate(employeeId);
      return { deactivated: employees.length };
    });
  }

  // ── documents ──────────────────────────────────────────────────────────────

  /**
   * Stores a document for the contract (the notice letter, a request, an attachment): PDF or an
   * image, checked by its bytes. It belongs to nobody until a decision attaches it (files follow
   * their record: unattached, it opens for nobody).
   */
  async uploadDocument(id: string, file: UploadedFileLike | undefined): Promise<ContractFileUpload> {
    await this.loadForWrite([id], { lock: false });
    const { type, buffer } = checkDocumentUpload(file, CONTRACT_DOCUMENT_UPLOAD);
    const fileUrl = await this.files.save(CONTRACT_DOCUMENT_FOLDER, `${id}-${randomUUID()}.${type}`, buffer);
    return { fileUrl };
  }

  /**
   * Whether `user` may open the document at `url`: a contract points at it, and `hr.contracts.view`
   * covers that contract's employee for them.
   */
  async canOpenDocument(user: Pick<AuthUser, 'id'>, url: string): Promise<boolean> {
    const row = await this.repository.findByDocument(url);
    if (!row) return false;
    return inScope(await this.access.scopeOf(user, VIEW), contractScopeFields(row));
  }

  /** Records the opening of a contract document (a sensitive folder), in a transaction of its own. */
  async recordDocumentOpened(url: string): Promise<void> {
    await this.afterCommit.inTransaction(async () => {
      const row = await this.repository.findByDocument(url);
      if (!row) throw new NotFoundException();
      await this.audit.record({
        action: 'hr.contract.document_open',
        entity: { type: AuditEntityType.EMPLOYEE_CONTRACT, id: row.id, label: contractAuditLabel(row) },
        changes: [{ field: 'document', before: null, after: url.split('/').pop() ?? url }],
      });
    });
  }

  // ── for the audit log and notifications ──────────────────────────────────

  /** The contracts `hr.contracts.view` covers for the viewer (Activity, R5). */
  async idsInViewScope(): Promise<string[] | 'all'> {
    const scope = await this.access.scope(VIEW);
    if (scope.kind === 'all') return 'all';
    return this.repository.idsWhereEmployee(await this.access.where(VIEW));
  }

  idsOfEmployee(employeeId: string): Promise<string[]> {
    return this.repository.idsOfEmployee(employeeId);
  }

  idsWithEmployeeCode(q: string): Promise<string[]> {
    return this.repository.idsWithEmployeeCode(q);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * The rows to act on: locked (unless `lock: false`), each known and covered by the viewer's view
   * scope (else 404, edge case 12), and — unless `own: false` — none the actor's own (403
   * `OWN_CONTRACT`, §2; with `ownAsRefusal` the caller lists them instead). The account must be
   * linked to tell (`ACCOUNT_NOT_LINKED`).
   */
  private async loadForWrite(
    ids: readonly string[],
    options: { lock?: boolean; own?: boolean; ownAsRefusal?: boolean } = {},
  ): Promise<ContractRow[]> {
    if (ids.length === 0) throw new NotFoundException();
    if (options.lock !== false) await this.repository.lockForUpdate(ids);
    const rows = await this.repository.findMany(ids);
    const scope: EmployeeScope = await this.access.scope(VIEW);
    if (rows.length !== ids.length || rows.some((r) => !inScope(scope, contractScopeFields(r)))) {
      throw new NotFoundException();
    }
    if (options.own === false) return rows;
    await this.access.assertLinkedForPay();
    if (!options.ownAsRefusal) {
      const actor = await this.access.actor();
      if (actor?.employeeId && rows.some((r) => r.employeeId === actor.employeeId)) {
        throw refusal(ErrorCode.OWN_CONTRACT);
      }
    }
    return rows;
  }

  private assertPendingRequest(row: ContractRow): void {
    if (row.status !== ContractStatus.ACTIVE || row.earlyTerminationStatus !== EarlyTerminationStatus.REQUESTED) {
      throw refusal(ErrorCode.EARLY_TERMINATION_NOT_PENDING);
    }
  }

  /** Edge case 9: an end before an approved payroll month's last day is refused. */
  private async assertPaidMonthsStand(endsOn: IsoDate): Promise<void> {
    const month = lockedMonthCutBy(endsOn, await this.monthLock.approvedMonthsFrom(endsOn.slice(0, 7)));
    if (month) {
      throw CodedException.withParams(HttpStatus.CONFLICT, ErrorCode.CONTRACT_END_MONTH_LOCKED, { month });
    }
  }

  /** A document passed to a decision must be one uploaded for this contract, and still stored. */
  private async assertOwnDocument(id: string, url: string): Promise<void> {
    const match = new RegExp(`^/files/${CONTRACT_DOCUMENT_FOLDER}/(${id}-[0-9a-f-]{36}\\.(?:pdf|png|jpg|webp))$`).exec(url);
    if (!match || !(await this.files.read(CONTRACT_DOCUMENT_FOLDER, match[1]))) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.CONTRACT_FILE_INVALID);
    }
  }

  /** The school calendar a contract reads: the contract year it started in. */
  private calendarOf(row: ContractRow): Promise<SchoolCalendarDates | null> {
    return this.calendars.dates(calendarYearOfContract(toIsoDate(row.startsOn)));
  }

  private resolveRequest(id: string, resolution: 'approved' | 'rejected', byUserId: string | null) {
    return this.notifications.resolve({
      type: 'hr.contract.early_termination_waiting',
      subject: { entityType: AuditEntityType.EMPLOYEE_CONTRACT, entityId: id },
      resolution,
      byUserId,
    });
  }

  private async presentOne(row: ContractRow): Promise<Contract> {
    const [contract] = await this.present([row]);
    return contract;
  }

  /** The rows as the API returns them: decisions on the school's today, the viewer's own marked. */
  private async present(rows: readonly ContractRow[]): Promise<Contract[]> {
    const today = this.today();
    const actor = await this.access.actor();
    const years = [...new Set(rows.map((r) => calendarYearOfContract(toIsoDate(r.startsOn))))];
    const calendars = new Map(
      await Promise.all(years.map(async (y) => [y, await this.calendars.dates(y)] as const)),
    );
    return rows.map((row) =>
      toContract(
        row,
        today,
        actor?.employeeId ?? null,
        calendars.get(calendarYearOfContract(toIsoDate(row.startsOn))) ?? null,
      ),
    );
  }
}

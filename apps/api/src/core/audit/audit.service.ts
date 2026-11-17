import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditActor,
  type AuditChange,
  type AuditEntityType,
  type AuditEntry,
  type AuditLabel,
  type AuditModule,
  type AuditSummary,
  type AuthUser,
  type Paginated,
  PermissionScope,
} from '@school-erp/shared';
import type { Request } from 'express';
import { CLS_REQ, ClsService } from 'nestjs-cls';
import type { DbAdapter } from '../../database/transactions';
import { PermissionsService } from '../permissions';
import { cleanChanges, diffChanges, hideSalaryValues, labelColumns } from './audit.pure';
import { AuditRecordAccess } from './audit-record-access';
import {
  AuditEntryRepository,
  type AuditEntryFilter,
  type AuditEntryRow,
} from './repositories/audit-entry.repository';

/** CLS key: the actions recorded in the current `@Audited` request (D6b). */
export const AUDIT_RECORDED = Symbol('audit:recorded');

export interface AuditRecordInput {
  action: AuditAction;
  /**
   * The record the action touched. `label` is a snapshot (the employee's name now): pass both
   * names (`{ en: nameEn, ar: nameAr }`) when the record has them, so Arabic sentences show the
   * Arabic name; a plain string (a user's name, a month) reads the same in both languages.
   */
  entity: { type: AuditEntityType; id: string; label: string | AuditLabel };
  /** Snapshots before / after: only the fields that differ are stored (D7). */
  before?: unknown;
  after?: unknown;
  /** Or the changes, listed by the caller (e.g. one per setting key). */
  changes?: AuditChange[];
  /**
   * Leave out: the signed-in user of the request (D4). Pass only where the request has no user
   * yet (a successful sign-in) or none applies (`null`, e.g. a failed sign-in).
   */
  actor?: { id: string; name?: string } | null;
}

/** `record()` was called with no open transaction: the entry could outlive a rolled-back change. */
export class AuditOutsideTransactionError extends Error {
  constructor(action: string) {
    super(`audit.record("${action}") must run inside a transaction (audit spec D2)`);
    this.name = 'AuditOutsideTransactionError';
  }
}

type RequestWithUser = Request & { user?: AuthUser };

/**
 * The audit log (core/audit, §9). Every module records its actions here, inside the same
 * transaction as the change (D2) — who, IP, device and request id come from the request (D4).
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly entries: AuditEntryRepository,
    private readonly txHost: TransactionHost<DbAdapter>,
    private readonly cls: ClsService,
    private readonly permissions: PermissionsService,
    private readonly recordAccess: AuditRecordAccess,
  ) {}

  /**
   * Records one action. Throws outside a transaction. Snapshots (or listed changes) that turn
   * out equal write nothing (edge case 3) but still count as recorded for `@Audited`.
   */
  async record(input: AuditRecordInput): Promise<void> {
    if (!this.txHost.isTransactionActive()) throw new AuditOutsideTransactionError(input.action);
    const definition = AUDIT_ACTIONS[input.action] as
      (typeof AUDIT_ACTIONS)[AuditAction] | undefined;
    if (!definition) throw new Error(`Unknown audit action "${input.action}"`);
    if (input.entity.type !== definition.entityType) {
      throw new Error(
        `Audit action "${input.action}" is about "${definition.entityType}", not "${input.entity.type}"`,
      );
    }

    const hasValues =
      input.changes !== undefined || input.before !== undefined || input.after !== undefined;
    const changes = input.changes
      ? cleanChanges(input.changes)
      : diffChanges(input.before, input.after);

    if (!hasValues || changes.length > 0) {
      const request = this.request();
      const actor = await this.actorFor(input.actor, request?.user);
      await this.entries.create({
        action: input.action,
        module: definition.module,
        entityType: input.entity.type,
        entityId: input.entity.id,
        ...labelColumns(input.entity.label),
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        changes,
        meta: {
          ip: request?.ip ?? null,
          userAgent: request?.headers['user-agent'] ?? null,
          requestId: this.cls.isActive() ? (this.cls.getId() ?? null) : null,
        },
        at: new Date(),
      });
    }
    this.markRecorded(input.action);
  }

  /**
   * Entries matching `filter`, newest first — only those about records the viewer may see (P4:
   * an employee or penalty outside their scope is left out), with salary-type values hidden from a
   * viewer without every salary (R7).
   */
  async list(
    filter: AuditEntryFilter,
    page: number,
    limit: number,
  ): Promise<Paginated<AuditEntry>> {
    const [restricted, salaryVisible] = await Promise.all([
      this.recordAccess.restrictions(),
      this.salaryVisible(),
    ]);
    const result = await this.entries.findPage({ ...filter, restricted }, page, limit);
    const actorIds = [...new Set(result.data.flatMap((row) => (row.actorId ? [row.actorId] : [])))];
    const linked = await this.entries.findLinkedEmployees(actorIds);
    return {
      ...result,
      data: result.data.map((row) => {
        const entry = toAuditEntry(row, linked);
        return salaryVisible ? entry : { ...entry, changes: hideSalaryValues(entry.changes) };
      }),
    };
  }

  /**
   * A record's History, optionally narrowed to one person or one changed field. 404 when the
   * viewer may not see the record (outside their scope — edge case 3).
   */
  async listForRecord(
    entityType: AuditEntityType,
    entityId: string,
    page: number,
    limit: number,
    filter: { actorId?: string; field?: string } = {},
  ): Promise<Paginated<AuditEntry>> {
    await this.assertCanSee(entityType, entityId);
    return this.list({ entityType, entityId, ...filter }, page, limit);
  }

  /** The people in the log (or on one record — 404 outside the viewer's scope), most recent first. */
  async listActors(record?: { entityType: AuditEntityType; entityId: string }): Promise<AuditActor[]> {
    if (record) await this.assertCanSee(record.entityType, record.entityId);
    return this.entries.findActors(record ?? {});
  }

  /** The fields a record's entries changed (its History field filter). 404 outside the scope. */
  async listFields(entityType: AuditEntityType, entityId: string): Promise<string[]> {
    await this.assertCanSee(entityType, entityId);
    return this.entries.findFields(entityType, entityId);
  }

  /**
   * The Activity page's day headers: how many entries match `filter` in each period, in order —
   * counting only what `list` would show the viewer.
   */
  async countPerPeriod(filter: AuditEntryFilter, periods: readonly { from: Date; to: Date }[]): Promise<number[]> {
    const restricted = await this.recordAccess.restrictions();
    return this.entries.countPerPeriod({ ...filter, restricted }, periods);
  }

  /** "Today at a glance" for `[from, to)`. */
  summary(from: Date, to: Date): Promise<AuditSummary> {
    return this.entries.summary(from, to);
  }

  private async assertCanSee(entityType: AuditEntityType, entityId: string): Promise<void> {
    if (!(await this.recordAccess.canSee(entityType, entityId))) throw new NotFoundException();
  }

  /**
   * Whether the viewer sees salary-type values (R7): only with `hr.employees.view_salary` at scope
   * `all` — the log is school-wide, so a narrower salary scope still hides them. No request user
   * (scripts): shown.
   */
  private async salaryVisible(): Promise<boolean> {
    const user = this.request()?.user;
    if (!user) return true;
    const scope = await this.permissions.scopeFor(user, 'hr.employees.view_salary');
    return scope?.scope === PermissionScope.ALL;
  }

  private request(): RequestWithUser | undefined {
    return this.cls.isActive() ? this.cls.get<RequestWithUser | undefined>(CLS_REQ) : undefined;
  }

  private async actorFor(
    given: AuditRecordInput['actor'],
    signedIn: AuthUser | undefined,
  ): Promise<{ id: string; name: string } | null> {
    if (given === null) return null;
    if (given === undefined) return signedIn ? { id: signedIn.id, name: signedIn.name } : null;
    if (given.name !== undefined) return { id: given.id, name: given.name };
    if (signedIn?.id === given.id) return { id: given.id, name: signedIn.name };
    return { id: given.id, name: (await this.entries.findUserName(given.id)) ?? '' };
  }

  private markRecorded(action: AuditAction): void {
    if (!this.cls.isActive()) return;
    this.cls.get<AuditAction[] | undefined>(AUDIT_RECORDED)?.push(action);
  }
}

/** `linked`: actor (user) id → the employee that user is linked to today. */
function toAuditEntry(row: AuditEntryRow, linked: ReadonlyMap<string, string>): AuditEntry {
  const meta = (row.meta ?? {}) as { ip?: string | null; userAgent?: string | null };
  return {
    id: row.id,
    action: row.action as AuditAction,
    module: row.module as AuditModule,
    entityType: row.entityType as AuditEntityType,
    entityId: row.entityId,
    // Older entries (and one-name records) have no Arabic label: the same name in both.
    entityLabel: { en: row.entityLabel, ar: row.entityLabelAr ?? row.entityLabel },
    actor: row.actorId
      ? { id: row.actorId, name: row.actorName ?? '', employeeId: linked.get(row.actorId) ?? null }
      : null,
    changes: (Array.isArray(row.changes) ? row.changes : []) as unknown as AuditChange[],
    meta: { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null },
    at: row.at.toISOString(),
  };
}

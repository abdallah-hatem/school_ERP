import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditActor,
  type AuditChange,
  type AuditEntityType,
  type AuditEntry,
  type AuditModule,
  type AuditSummary,
  type AuthUser,
  type Paginated,
} from '@school-erp/shared';
import type { Request } from 'express';
import { CLS_REQ, ClsService } from 'nestjs-cls';
import type { DbAdapter } from '../../database/transactions';
import { cleanChanges, diffChanges } from './audit.pure';
import {
  AuditEntryRepository,
  type AuditEntryFilter,
  type AuditEntryRow,
} from './repositories/audit-entry.repository';

/** CLS key: the actions recorded in the current `@Audited` request (D6b). */
export const AUDIT_RECORDED = Symbol('audit:recorded');

export interface AuditRecordInput {
  action: AuditAction;
  /** The record the action touched. `label` is a snapshot (the employee's name now). */
  entity: { type: AuditEntityType; id: string; label: string };
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
        entityLabel: input.entity.label,
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

  async list(
    filter: AuditEntryFilter,
    page: number,
    limit: number,
  ): Promise<Paginated<AuditEntry>> {
    const result = await this.entries.findPage(filter, page, limit);
    return { ...result, data: result.data.map(toAuditEntry) };
  }

  /** A record's History, optionally narrowed to one person or one changed field. */
  listForRecord(
    entityType: AuditEntityType,
    entityId: string,
    page: number,
    limit: number,
    filter: { actorId?: string; field?: string } = {},
  ): Promise<Paginated<AuditEntry>> {
    return this.list({ entityType, entityId, ...filter }, page, limit);
  }

  /** The people in the log (or on one record), latest name, most recently active first. */
  listActors(record?: { entityType: AuditEntityType; entityId: string }): Promise<AuditActor[]> {
    return this.entries.findActors(record ?? {});
  }

  /** The fields a record's entries changed (its History field filter). */
  listFields(entityType: AuditEntityType, entityId: string): Promise<string[]> {
    return this.entries.findFields(entityType, entityId);
  }

  /** "Today at a glance" for `[from, to)`. */
  summary(from: Date, to: Date): Promise<AuditSummary> {
    return this.entries.summary(from, to);
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

function toAuditEntry(row: AuditEntryRow): AuditEntry {
  const meta = (row.meta ?? {}) as { ip?: string | null; userAgent?: string | null };
  return {
    id: row.id,
    action: row.action as AuditAction,
    module: row.module as AuditModule,
    entityType: row.entityType as AuditEntityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    actor: row.actorId ? { id: row.actorId, name: row.actorName ?? '' } : null,
    changes: (Array.isArray(row.changes) ? row.changes : []) as unknown as AuditChange[],
    meta: { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null },
    at: row.at.toISOString(),
  };
}

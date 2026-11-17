import { Injectable } from '@nestjs/common';
import type { AuditEntityType } from '@school-erp/shared';

/** The records of one type the current viewer may see: their ids, or every one. */
export type VisibleRecords = readonly string[] | 'all';

/** Answers, for the current request's user, which records of a type they may see. */
export type VisibleRecordsResolver = () => Promise<VisibleRecords>;

/** Entries about records of `entityType` outside `ids` are left out of what the viewer gets. */
export interface AuditRestriction {
  entityType: AuditEntityType;
  ids: readonly string[];
}

/**
 * Which records' entries the viewer may read (R5, P4). Core can't know what "my team" means for
 * another module's records, so the module that owns a record type registers a resolver here at
 * start-up (HR: employees and penalties, by the viewer's scope); the audit log asks it on every
 * read. A type nobody registered is visible in full.
 */
@Injectable()
export class AuditRecordAccess {
  private readonly resolvers = new Map<AuditEntityType, VisibleRecordsResolver>();

  register(entityType: AuditEntityType, resolver: VisibleRecordsResolver): void {
    this.resolvers.set(entityType, resolver);
  }

  /** The types the viewer sees only part of, with the ids they may see. */
  async restrictions(): Promise<AuditRestriction[]> {
    const out: AuditRestriction[] = [];
    for (const [entityType, resolve] of this.resolvers) {
      const ids = await resolve();
      if (ids !== 'all') out.push({ entityType, ids });
    }
    return out;
  }

  /** Whether the viewer may read the entries of one record. */
  async canSee(entityType: AuditEntityType, entityId: string): Promise<boolean> {
    const resolve = this.resolvers.get(entityType);
    if (!resolve) return true;
    const ids = await resolve();
    return ids === 'all' || ids.includes(entityId);
  }
}

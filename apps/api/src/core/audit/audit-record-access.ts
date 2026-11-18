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

/** Some records of one type: an entry is about one of them when its type matches and its id is in `ids`. */
export interface AuditRecordSet {
  entityType: AuditEntityType;
  ids: readonly string[];
}

/** The ids of the records of a child type that belong to one parent record (an employee's penalties). */
export type RelatedRecordsResolver = (parentId: string) => Promise<readonly string[]>;

/**
 * The ids of the records of a type that Activity's search `q` matches by something the entry does
 * not store — an employee's code (the entry keeps their names as its label).
 */
export type RecordSearchResolver = (q: string) => Promise<readonly string[]>;

/**
 * What core can't know about another module's records, registered at start-up by the module that
 * owns them (HR: employees, penalties, lateness months, payroll runs):
 * - **access** (R5, P4): which records' entries the viewer may read — the audit log asks on every
 *   read; a type nobody registered is visible in full;
 * - **related records**: the child records whose entries a parent's History lists too (an
 *   employee's History shows their penalties' entries);
 * - **search**: the records Activity's search matches by a field kept outside the entry (an
 *   employee's code), read live — so it also finds entries written before search knew the field.
 */
@Injectable()
export class AuditRecordAccess {
  private readonly resolvers = new Map<AuditEntityType, VisibleRecordsResolver>();
  private readonly related = new Map<
    AuditEntityType,
    { childType: AuditEntityType; resolve: RelatedRecordsResolver }[]
  >();
  private readonly searches = new Map<AuditEntityType, RecordSearchResolver>();

  register(entityType: AuditEntityType, resolver: VisibleRecordsResolver): void {
    this.resolvers.set(entityType, resolver);
  }

  /** `parentType`'s History also lists the entries of the `childType` records `resolve` returns. */
  registerRelated(
    parentType: AuditEntityType,
    childType: AuditEntityType,
    resolve: RelatedRecordsResolver,
  ): void {
    this.related.set(parentType, [...(this.related.get(parentType) ?? []), { childType, resolve }]);
  }

  /** Activity's search also matches the entries of the `entityType` records `resolve` returns. */
  registerSearch(entityType: AuditEntityType, resolve: RecordSearchResolver): void {
    this.searches.set(entityType, resolve);
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

  /** What a record's History lists: the record itself, then its related records (types with any). */
  async historyRecords(entityType: AuditEntityType, entityId: string): Promise<AuditRecordSet[]> {
    const out: AuditRecordSet[] = [{ entityType, ids: [entityId] }];
    for (const { childType, resolve } of this.related.get(entityType) ?? []) {
      const ids = await resolve(entityId);
      if (ids.length) out.push({ entityType: childType, ids });
    }
    return out;
  }

  /** The records the search `q` matches outside the entries' labels (only types with a match). */
  async searchMatches(q: string): Promise<AuditRecordSet[]> {
    const out: AuditRecordSet[] = [];
    for (const [entityType, resolve] of this.searches) {
      const ids = await resolve(q);
      if (ids.length) out.push({ entityType, ids });
    }
    return out;
  }
}

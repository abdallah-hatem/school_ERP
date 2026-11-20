import { SetMetadata } from '@nestjs/common';
import type { AuditAction } from '@school-erp/shared';

export const AUDITED_KEY = 'audit:action';
export const NOT_AUDITED_KEY = 'audit:notAudited';

/**
 * Declares the audit action a write endpoint records (D6). The handler runs in one transaction
 * with its entry; if it succeeds without calling `audit.record()` for this action, the request
 * fails with `AUDIT_NOT_RECORDED` and the change rolls back (D6b).
 *
 * @example @Patch('school') @Audited('core.settings.update') update(...) {}
 */
export const Audited = (action: AuditAction) => SetMetadata(AUDITED_KEY, action);

/**
 * Declares, with the reason, that a write endpoint records nothing (D6) — e.g. a token refresh.
 * Only for writes deliberately not recorded: the temporary `'wired in T28'` / `'wired in T29'`
 * placeholders are gone, and the scan test fails on any.
 */
export const NotAudited = (reason: string) => SetMetadata(NOT_AUDITED_KEY, reason);

/** What a handler declared: its action, its reason for none, or nothing. */
export type AuditDeclaration =
  | { kind: 'audited'; action: AuditAction }
  | { kind: 'not-audited'; reason: string }
  | { kind: 'none' };

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- any route handler
export function auditDeclarationOf(handler: Function): AuditDeclaration {
  const action = Reflect.getMetadata(AUDITED_KEY, handler) as AuditAction | undefined;
  if (action) return { kind: 'audited', action };
  const reason = Reflect.getMetadata(NOT_AUDITED_KEY, handler) as string | undefined;
  if (typeof reason === 'string' && reason.trim()) return { kind: 'not-audited', reason };
  return { kind: 'none' };
}

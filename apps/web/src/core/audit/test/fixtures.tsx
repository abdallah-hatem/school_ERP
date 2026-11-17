import type { AnchorHTMLAttributes, ReactElement, ReactNode } from 'react';
import type { AuditActor, AuditEntry, SessionUser } from '@school-erp/shared';
import { renderWithI18n, TEST_SESSION } from '@/test/render';
import { AuditI18n } from '../messages';

/** A link that only reports its href (navigation is the router's job). */
export function MockLink(
  props: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; scroll?: boolean; prefetch?: boolean },
) {
  const anchor = { ...props };
  delete anchor.scroll;
  delete anchor.prefetch;
  return <a {...anchor} onClick={(e) => e.preventDefault()} />;
}

export const MONA: AuditActor = { id: '11111111-1111-4111-8111-111111111111', name: 'Mona Ibrahim' };
export const AHMED: AuditActor = { id: '22222222-2222-4222-8222-222222222222', name: 'Ahmed Mahmoud' };

let seq = 0;
/** An entry: an employee edit by Mona unless told otherwise. */
export function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  seq += 1;
  return {
    id: `e-${seq}`,
    action: 'hr.employee.update',
    module: 'hr',
    entityType: 'employee',
    entityId: '33333333-3333-4333-8333-333333333333',
    entityLabel: { en: 'Omar Fathy', ar: 'عمر فتحي' },
    actor: MONA,
    changes: [{ field: 'phone', before: '01001234567', after: '01112345678' }],
    meta: { ip: null, userAgent: null },
    at: '2026-11-17T12:24:00.000Z',
    ...over,
  };
}

/** The server's clock in tests: 17 Nov 2026, 14:36 in Cairo (12:36 UTC). */
export const NOW = '2026-11-17T12:36:00.000Z';

export function renderAudit(ui: ReactElement, locale: 'en' | 'ar' = 'en', session: SessionUser | null = TEST_SESSION) {
  return renderWithI18n(<AuditI18n locale={locale}>{ui}</AuditI18n>, { locale, session });
}

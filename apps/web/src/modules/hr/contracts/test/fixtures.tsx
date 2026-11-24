import type { Contract, ContractTotals, SessionUser } from '@school-erp/shared';
import type { ReactElement } from 'react';
import type { Locale } from '@/shared/lib/i18n';
import { renderWithI18n, TEST_SESSION } from '@/test/render';
import { ContractsI18n } from '../messages';

/** Test data for the contracts screens. */

export const TODAY = '2026-11-24';

export const calendar = {
  term1Start: '2026-09-20',
  term1End: '2027-01-28',
  term2Start: '2027-02-07',
  nonRenewalDeadline: '2027-04-30',
};

export function contract(overrides: Partial<Contract> & { id?: string } = {}): Contract {
  return {
    id: 'c-1',
    employee: {
      id: 'e-mona',
      code: 'EMP-0012',
      nameEn: 'Mona Khalil',
      nameAr: 'منى خليل',
      photoUrl: null,
      gender: 'FEMALE',
      status: 'ACTIVE',
      stage: { id: 's-pri', nameEn: 'Primary', nameAr: 'الابتدائي', isNoStage: false },
      jobTitle: { id: 'j-ar', nameEn: 'Arabic teacher', nameAr: 'معلمة لغة عربية' },
    },
    year: 2026,
    startsOn: '2026-06-01',
    endsOn: '2027-05-31',
    status: 'ACTIVE',
    phase: 'CURRENT',
    decision: 'UNDECIDED',
    nonRenewalBy: null,
    note: null,
    notice: null,
    earlyTermination: null,
    endedOn: null,
    endReason: null,
    endNote: null,
    endFileUrl: null,
    decidedBy: null,
    decidedAt: null,
    next: null,
    renewalOf: null,
    toDeactivate: false,
    ownContract: false,
    carriedOver: false,
    calendars: { notice: calendar, earlyTermination: calendar },
    ...overrides,
  };
}

export const totals: ContractTotals = {
  ending: 42,
  carriedOver: 1,
  decided: 27,
  renewing: 21,
  notRenewing: 6,
  open: 15,
  endedNoDecision: 1,
  notices: 3,
  noticesEarly: 1,
  noticesLate: 0,
  toDeactivate: 1,
};

/** Render a contracts component with the `contracts` + `errors` namespaces, like its route does. */
export function renderContracts(ui: ReactElement, locale: Locale = 'en', session: SessionUser = TEST_SESSION) {
  return renderWithI18n(<ContractsI18n locale={locale}>{ui}</ContractsI18n>, { locale, session });
}

/** A failed envelope as `apiFetch` returns it. */
export const failure = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  ({ success: false, status, error, message: 'Server message', ...extra }) as never;

export const ok = <T,>(data: T) => ({ success: true, status: 200, data }) as never;

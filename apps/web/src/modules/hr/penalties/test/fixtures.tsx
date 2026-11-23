import type { PenaltyGroup, PenaltyRecord, SessionUser } from '@school-erp/shared';
import type { ReactElement } from 'react';
import type { Locale } from '@/shared/lib/i18n';
import { renderWithI18n, TEST_SESSION } from '@/test/render';
import { PenaltiesI18n } from '../messages';

/** Test data for the penalties screens. */

export const groups: PenaltyGroup[] = [
  {
    id: 'g-b',
    nameEn: 'Table B',
    nameAr: 'الجدول ب',
    sortOrder: 2,
    isActive: true,
    violations: [
      {
        id: 'v-phone',
        nameEn: 'Using a phone in class',
        nameAr: 'استخدام الهاتف في الفصل',
        note: null,
        isActive: true,
        oncePerDay: true,
        levels: [{ level: 1, action: 'WARNING', days: null }],
      },
    ],
  },
  {
    id: 'g-a',
    nameEn: 'General table A',
    nameAr: 'الجدول العام أ',
    sortOrder: 1,
    isActive: true,
    violations: [
      {
        id: 'v-late',
        nameEn: 'Late arrival without notice',
        nameAr: 'التأخر دون إخطار',
        note: null,
        isActive: true,
        oncePerDay: true,
        levels: [
          { level: 1, action: 'NOTICE', days: null },
          { level: 2, action: 'DEDUCT_DAYS', days: 0.5 },
        ],
      },
      {
        id: 'v-retired',
        nameEn: 'Old rule',
        nameAr: 'قاعدة قديمة',
        note: null,
        isActive: false,
        oncePerDay: true,
        levels: [{ level: 1, action: 'NOTICE', days: null }],
      },
    ],
  },
  {
    id: 'g-retired',
    nameEn: 'Retired table',
    nameAr: 'جدول ملغى',
    sortOrder: 3,
    isActive: false,
    violations: [
      {
        id: 'v-in-retired-group',
        nameEn: 'Retired by its group',
        nameAr: 'ملغاة مع جدولها',
        note: null,
        isActive: true,
        oncePerDay: true,
        levels: [{ level: 1, action: 'NOTICE', days: null }],
      },
    ],
  },
];

export function record(overrides: Partial<PenaltyRecord> = {}): PenaltyRecord {
  return {
    id: 'p-1',
    employee: { id: 'e-mona', code: 'EMP-0001', nameEn: 'Mona Khalil', nameAr: 'منى خليل' },
    violation: { id: 'v-late', nameEn: 'Late arrival without notice', nameAr: 'التأخر دون إخطار' },
    date: '2026-11-05',
    level: 2,
    action: 'DEDUCT_DAYS',
    days: 0.5,
    status: 'WAITING_HR',
    stage: { id: 's-pri', nameEn: 'Primary', nameAr: 'الابتدائي' },
    note: null,
    cancelReason: null,
    createdBy: null,
    createdAt: '2026-11-05T09:00:00.000Z',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    reviewSkip: null,
    approvedBy: null,
    approvedAt: null,
    approvalNote: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedStep: null,
    rejectionReason: null,
    cancelledAt: null,
    hrMayDecide: false,
    ownPenalty: false,
    earlierPending: null,
    recount: [],
    recountElsewhere: 0,
    recountLockedMonth: null,
    ...overrides,
  };
}

/** Render a penalties component with the `penalties` + `errors` namespaces, like its route does. */
export function renderPenalties(ui: ReactElement, locale: Locale = 'en', session: SessionUser = TEST_SESSION) {
  return renderWithI18n(<PenaltiesI18n locale={locale}>{ui}</PenaltiesI18n>, { locale, session });
}

/** A failed envelope as `apiFetch` returns it. */
export const failure = (status: number, error: string, message = 'Server message') =>
  ({ success: false, status, error, message }) as never;

export const ok = <T,>(data: T) => ({ success: true, status: 200, data }) as never;

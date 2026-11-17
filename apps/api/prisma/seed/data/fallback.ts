import { PenaltyAction } from '@school-erp/shared';
import type { SeedCatalogue, SeedLevel, SeedSchool } from './types';

/**
 * Generic stand-ins used when `prisma/seed-data.local/` is missing (CI, a fresh clone). They are
 * deliberately NOT any school's material: a placeholder name, no logo and a short catalogue.
 */

export const FALLBACK_SCHOOL: SeedSchool = {
  nameEn: 'School ERP Demo',
  nameAr: 'مدرسة تجريبية',
};

const days = (n: number): SeedLevel => ({ action: PenaltyAction.DEDUCT_DAYS, days: n });
const NOTICE: SeedLevel = { action: PenaltyAction.NOTICE };
const WARNING: SeedLevel = { action: PenaltyAction.WARNING };

export const FALLBACK_CATALOGUE: SeedCatalogue = {
  groups: [
    {
      nameEn: 'Attendance',
      nameAr: 'الحضور والانصراف',
      violations: [
        {
          seedKey: 'unexcused-absence',
          nameEn: 'Absence without an accepted excuse',
          nameAr: 'الغياب بدون عذر مقبول',
          levels: [days(0.5), days(1), days(2), days(3)],
        },
        {
          seedKey: 'not-signing-attendance',
          nameEn: 'Not recording attendance',
          nameAr: 'عدم تسجيل الحضور',
          levels: [NOTICE, days(0.25), days(0.5), days(1)],
        },
      ],
    },
    {
      nameEn: 'Conduct',
      nameAr: 'السلوك الوظيفي',
      violations: [
        {
          nameEn: 'Refusing to work with the team',
          nameAr: 'رفض العمل مع الفريق',
          levels: [WARNING, days(1), days(2)],
        },
      ],
    },
    {
      nameEn: 'General',
      nameAr: 'مخالفات عامة',
      violations: [
        {
          seedKey: 'dress',
          nameEn: 'Not following the dress code',
          nameAr: 'مخالفة قواعد الزي',
          levels: [NOTICE, days(0.5), days(1)],
        },
        {
          seedKey: 'chewing-gum',
          nameEn: 'Eating during lessons',
          nameAr: 'تناول الطعام أثناء الحصص',
          levels: [NOTICE, WARNING, days(0.25)],
        },
      ],
    },
    {
      nameEn: 'Teaching',
      nameAr: 'المهام التعليمية',
      violations: [
        {
          seedKey: 'late-to-class',
          nameEn: 'Late to class',
          nameAr: 'التأخر عن الحصة',
          levels: [days(0.25), days(0.5), days(1)],
          // Several classes a day: each late arrival is its own penalty (§4).
          oncePerDay: false,
        },
        {
          seedKey: 'phone-in-class',
          nameEn: 'Mobile phone use during lessons',
          nameAr: 'استعمال المحمول أثناء الدروس',
          levels: [NOTICE, days(0.25), days(0.5), days(1)],
        },
      ],
    },
  ],
};

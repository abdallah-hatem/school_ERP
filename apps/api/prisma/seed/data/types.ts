import type { PenaltyAction } from '@school-erp/shared';

/**
 * The shapes of the seed's data. The school-specific pieces (identity, logo, penalty catalogue)
 * come from `prisma/seed-data.local/` when present (git-ignored client material), else from the
 * generic fallback in `./fallback.ts`.
 */

export interface SeedSchool {
  nameEn: string;
  nameAr: string;
}

/** One catalogue level; its number is its position (1-based) in `levels`. */
export interface SeedLevel {
  action: PenaltyAction;
  days?: number | null;
}

export interface SeedViolation {
  nameEn: string;
  nameAr: string;
  note?: string | null;
  levels: SeedLevel[];
  /**
   * §4 once per day: at most one penalty per employee per date. Default true; false for the
   * violations that genuinely repeat within a day (late to class, leaving a task early…).
   */
  oncePerDay?: boolean;
  /**
   * Seed-only handle the November demo penalties use to find this violation (see
   * `DEMO_VIOLATION_KEYS`). Not stored.
   */
  seedKey?: string;
}

export interface SeedGroup {
  nameEn: string;
  nameAr: string;
  violations: SeedViolation[];
}

export interface SeedCatalogue {
  groups: SeedGroup[];
}

/** What the seed loaded, and from where. */
export interface SeedData {
  source: 'local' | 'fallback';
  school: SeedSchool;
  catalogue: SeedCatalogue;
  /** Absolute path of the school logo (png / jpg / svg), or null for none. */
  logoPath: string | null;
}

/** The catalogue violations the demo penalties are recorded against. Every catalogue has them. */
export const DEMO_VIOLATION_KEYS = [
  'unexcused-absence',
  'not-signing-attendance',
  'late-to-class',
  'phone-in-class',
  'dress',
  'chewing-gum',
] as const;
export type DemoViolationKey = (typeof DEMO_VIOLATION_KEYS)[number];

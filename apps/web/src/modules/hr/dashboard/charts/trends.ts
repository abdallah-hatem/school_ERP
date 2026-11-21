import type { HrDashboardAnalytics } from '@school-erp/shared';

/**
 * Whether the trend charts are drawn: two approved months or more ("Charts appear after two
 * approved months"). Below that the range switch hides too. Plain (no 'use client'): the server
 * header asks it as well.
 */
export const hasTrends = (data: Pick<HrDashboardAnalytics, 'approvedMonths'>): boolean => data.approvedMonths >= 2;

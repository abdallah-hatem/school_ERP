import { Controller, Get, Query } from '@nestjs/common';
import { dashboardAnalyticsQuerySchema, type DashboardAnalyticsQuery } from '@school-erp/shared';
import { SchemaPipe } from '../../../../common/pipes/schema.pipe';
import { Permission } from '../../../../core/permissions';
import { DashboardAnalyticsService } from '../services/dashboard-analytics.service';
import { DashboardService } from '../services/dashboard.service';

/** `GET /hr/dashboard` (contract: "Dashboard — hr") and its charts. */
@Controller('hr/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly analytics: DashboardAnalyticsService,
  ) {}

  @Get()
  @Permission('hr.dashboard.view')
  get() {
    return this.dashboard.get();
  }

  /**
   * `GET /hr/dashboard/analytics?months=6|12` — the home page's charts (§2, owner 2026-11-21:
   * System admin only to start with). Each part is null without its screen's permission.
   */
  @Get('analytics')
  @Permission('hr.dashboard.view_analytics')
  getAnalytics(@Query(new SchemaPipe(dashboardAnalyticsQuerySchema)) query: DashboardAnalyticsQuery) {
    return this.analytics.get(query.months);
  }
}

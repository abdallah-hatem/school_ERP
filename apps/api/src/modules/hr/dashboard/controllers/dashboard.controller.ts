import { Controller, Get } from '@nestjs/common';
import { DashboardService } from '../services/dashboard.service';
import { Permission } from '../../../../core/permissions';

/** `GET /hr/dashboard` (contract: "Dashboard — hr"). */
@Controller('hr/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Permission('hr.dashboard.view')
  get() {
    return this.dashboard.get();
  }
}

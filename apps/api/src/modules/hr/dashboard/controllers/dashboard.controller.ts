import { Controller, Get } from '@nestjs/common';
import { DashboardService } from '../services/dashboard.service';

/** `GET /hr/dashboard` (contract: "Dashboard — hr"). */
@Controller('hr/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get() {
    return this.dashboard.get();
  }
}

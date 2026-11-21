import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import type { AuthUser, LatenessMonth, LatenessSummary } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { LatenessMonthParamDto, LatenessMonthQueryDto, PutLatenessDto } from '../dto/lateness.dto';
import { LatenessService } from '../services/lateness.service';
import { Audited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';

/**
 * `/hr/lateness` (contract: "Monthly lateness — hr"). The month's list is one row per active
 * employee, paged and searched here (owner, 2026-11-21: never in the browser), with the month's
 * `locked` flag, its rule and its totals over every listed employee.
 */
@Controller('hr/lateness')
export class LatenessController {
  constructor(private readonly lateness: LatenessService) {}

  @Get()
  @Permission('hr.lateness.view')
  list(@Query() query: LatenessMonthQueryDto): Promise<LatenessMonth> {
    return this.lateness.month(query.month, query);
  }

  @Audited('hr.lateness.save')
  @Put(':month')
  @Permission('hr.lateness.edit')
  put(
    @Param() params: LatenessMonthParamDto,
    @Body() body: PutLatenessDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<LatenessSummary> {
    return this.lateness.put(params.month, body, user?.id ?? null);
  }
}

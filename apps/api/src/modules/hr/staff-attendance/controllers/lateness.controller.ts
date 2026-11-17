import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import type { AuthUser, LatenessRow } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { LatenessMonthParamDto, LatenessMonthQueryDto, PutLatenessDto } from '../dto/lateness.dto';
import { LatenessService } from '../services/lateness.service';

/**
 * `/hr/lateness` (contract: "Monthly lateness — hr"). The month's list is one row per active
 * employee — a bounded set, returned whole (not paginated) as the contract specifies.
 */
@Controller('hr/lateness')
export class LatenessController {
  constructor(private readonly lateness: LatenessService) {}

  @Get()
  list(@Query() query: LatenessMonthQueryDto): Promise<LatenessRow[]> {
    return this.lateness.list(query.month);
  }

  @Put(':month')
  put(
    @Param() params: LatenessMonthParamDto,
    @Body() body: PutLatenessDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<LatenessRow[]> {
    return this.lateness.put(params.month, body, user?.id ?? null);
  }
}

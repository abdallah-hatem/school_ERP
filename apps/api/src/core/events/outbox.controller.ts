import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PAGINATION, type ApiResponse, type OutboxDeliveryView } from '@school-erp/shared';
import type { Request } from 'express';
import { ResponseUtil } from '../../common/utils/response.util';
import { Audited } from '../audit';
import { Permission } from '../permissions';
import { ListOutboxDeliveriesQueryDto } from './dto/list-outbox-deliveries.dto';
import { OutboxAdmin } from './outbox-admin.service';

/**
 * Event deliveries (core/events, the outbox): for an admin to find deliveries that gave up after
 * 10 failures and send them again. No screen yet.
 */
@Controller('outbox')
export class OutboxController {
  constructor(private readonly outbox: OutboxAdmin) {}

  /** Deliveries, newest event first; `status=dead` for the ones that gave up. */
  @Get('deliveries')
  @Permission('core.outbox.manage')
  async list(
    @Query() query: ListOutboxDeliveriesQueryDto,
    @Req() req: Request,
  ): Promise<ApiResponse<OutboxDeliveryView[]>> {
    const page = await this.outbox.list({
      status: query.status,
      page: query.page ?? PAGINATION.defaultPage,
      limit: query.limit ?? PAGINATION.defaultLimit,
    });
    return ResponseUtil.paginated(page, undefined, req.url);
  }

  /** One more try for a dead delivery, right after the commit; failing again makes it dead again. */
  @Post('deliveries/:id/retry')
  @Permission('core.outbox.manage')
  @Audited('core.outbox.retry')
  @HttpCode(HttpStatus.OK)
  retry(@Param('id', ParseUUIDPipe) id: string): Promise<OutboxDeliveryView> {
    return this.outbox.retry(id);
  }
}

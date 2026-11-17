import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import { PAGINATION, type ApiResponse, type AuditEntry } from '@school-erp/shared';
import type { Request } from 'express';
import { ResponseUtil } from '../../common/utils/response.util';
import { Permission } from '../permissions';
import { AuditService } from './audit.service';
import { AuditListQueryDto, AuditPageQueryDto, AuditRecordParamsDto } from './dto/audit-query.dto';

/** Read-only (no write endpoints: entries are written by modules through `AuditService`). D10. */
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** The Activity page: everything, newest first, filtered and paged on the server. */
  @Get()
  @Permission('core.audit.view')
  async list(
    @Query() query: AuditListQueryDto,
    @Req() req: Request,
  ): Promise<ApiResponse<AuditEntry[]>> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from >= to) throw new BadRequestException('from must be before to');
    const page = await this.audit.list(
      {
        actorId: query.actorId,
        module: query.module,
        action: query.action,
        from,
        to,
        q: query.q || undefined,
      },
      query.page ?? PAGINATION.defaultPage,
      query.limit ?? PAGINATION.defaultLimit,
    );
    return ResponseUtil.paginated(page, undefined, req.url);
  }

  /** A record's History (employee profile, payroll run): its entries, newest first. */
  @Get('records/:entityType/:entityId')
  @Permission('core.audit.view')
  async forRecord(
    @Param() params: AuditRecordParamsDto,
    @Query() query: AuditPageQueryDto,
    @Req() req: Request,
  ): Promise<ApiResponse<AuditEntry[]>> {
    const page = await this.audit.listForRecord(
      params.entityType,
      params.entityId,
      query.page ?? PAGINATION.defaultPage,
      query.limit ?? PAGINATION.defaultLimit,
    );
    return ResponseUtil.paginated(page, undefined, req.url);
  }
}

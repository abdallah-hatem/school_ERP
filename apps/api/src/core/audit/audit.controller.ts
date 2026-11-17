import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import {
  PAGINATION,
  type ApiResponse,
  type AuditActor,
  type AuditEntry,
  type AuditSummary,
} from '@school-erp/shared';
import type { Request } from 'express';
import { ResponseUtil } from '../../common/utils/response.util';
import { Permission } from '../permissions';
import { AuditService } from './audit.service';
import {
  AuditActorsQueryDto,
  AuditDayTotalsQueryDto,
  AuditListQueryDto,
  AuditRecordParamsDto,
  AuditRecordQueryDto,
  AuditSummaryQueryDto,
  parsePeriod,
} from './dto/audit-query.dto';

/** `[from, to)` as dates; 400 when `from` is not before `to`. */
function period(from?: string, to?: string): { from?: Date; to?: Date } {
  const start = from ? new Date(from) : undefined;
  const end = to ? new Date(to) : undefined;
  if (start && end && start >= end) throw new BadRequestException('from must be before to');
  return { from: start, to: end };
}

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
    const page = await this.audit.list(
      {
        actorId: query.actorId,
        module: query.module,
        actions: query.action,
        ...period(query.from, query.to),
        q: query.q || undefined,
      },
      query.page ?? PAGINATION.defaultPage,
      query.limit ?? PAGINATION.defaultLimit,
    );
    return ResponseUtil.paginated(page, undefined, req.url);
  }

  /**
   * The Activity page's day headers: for the same filters as `GET /audit`, how many entries fall in
   * each period (`periods=<from>/<to>,…`, the school days on screen), in order. 400 on a bad period.
   */
  @Get('day-totals')
  @Permission('core.audit.view')
  dayTotals(@Query() query: AuditDayTotalsQueryDto): Promise<number[]> {
    const periods = query.periods.map((p) => {
      const period = parsePeriod(p);
      if (!period) throw new BadRequestException(`Invalid period "${p}": use <from>/<to> with from before to`);
      return period;
    });
    return this.audit.countPerPeriod(
      { actorId: query.actorId, module: query.module, actions: query.action, q: query.q || undefined },
      periods,
    );
  }

  /** Activity's "today at a glance": entries, people, money entries and failed sign-ins. */
  @Get('summary')
  @Permission('core.audit.view')
  summary(@Query() query: AuditSummaryQueryDto): Promise<AuditSummary> {
    const { from, to } = period(query.from, query.to);
    return this.audit.summary(from as Date, to as Date);
  }

  /** The person pickers: everyone in the log, or the people who touched one record. */
  @Get('actors')
  @Permission('core.audit.view')
  actors(@Query() query: AuditActorsQueryDto): Promise<AuditActor[]> {
    if (Boolean(query.entityType) !== Boolean(query.entityId)) {
      throw new BadRequestException('entityType and entityId go together');
    }
    return this.audit.listActors(
      query.entityType && query.entityId
        ? { entityType: query.entityType, entityId: query.entityId }
        : undefined,
    );
  }

  /** A record's History (employee profile, payroll run): its entries, newest first. */
  @Get('records/:entityType/:entityId')
  @Permission('core.audit.view')
  async forRecord(
    @Param() params: AuditRecordParamsDto,
    @Query() query: AuditRecordQueryDto,
    @Req() req: Request,
  ): Promise<ApiResponse<AuditEntry[]>> {
    const page = await this.audit.listForRecord(
      params.entityType,
      params.entityId,
      query.page ?? PAGINATION.defaultPage,
      query.limit ?? PAGINATION.defaultLimit,
      { actorId: query.actorId, field: query.field },
    );
    return ResponseUtil.paginated(page, undefined, req.url);
  }

  /** The fields a record's entries changed (its History field filter). */
  @Get('records/:entityType/:entityId/fields')
  @Permission('core.audit.view')
  fields(@Param() params: AuditRecordParamsDto): Promise<string[]> {
    return this.audit.listFields(params.entityType, params.entityId);
  }
}

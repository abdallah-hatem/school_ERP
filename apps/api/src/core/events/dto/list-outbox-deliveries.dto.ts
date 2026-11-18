import { OUTBOX_STATUSES, type OutboxStatus } from '@school-erp/shared';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** `GET /outbox/deliveries?status&page&limit`. */
export class ListOutboxDeliveriesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(OUTBOX_STATUSES)
  status?: OutboxStatus;
}

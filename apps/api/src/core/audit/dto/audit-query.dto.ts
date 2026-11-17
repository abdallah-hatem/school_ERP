import {
  AUDIT_ACTION_KEYS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  PAGINATION,
  type AuditAction,
  type AuditEntityType,
  type AuditModule,
} from '@school-erp/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** `?page&limit` — `limit` above the contract max (100) is a 400. */
export class AuditPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = PAGINATION.defaultPage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.maxLimit)
  limit?: number = PAGINATION.defaultLimit;
}

/** `GET /audit` filters. `from` inclusive, `to` exclusive (ISO 8601; the client picks the day edges). */
export class AuditListQueryDto extends AuditPageQueryDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsIn(AUDIT_MODULES)
  module?: AuditModule;

  @IsOptional()
  @IsIn(AUDIT_ACTION_KEYS)
  action?: AuditAction;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  /** The record's label: employee name or code, payroll month. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  q?: string;
}

/** `/audit/records/:entityType/:entityId` */
export class AuditRecordParamsDto {
  @IsIn(AUDIT_ENTITY_TYPES)
  entityType!: AuditEntityType;

  /** A uuid for most records; a month (`2026-10`) for lateness. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  entityId!: string;
}

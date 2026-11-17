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
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
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

/** `action=a,b` or `action=a&action=b` → `['a', 'b']` (empty parts dropped). */
const list = ({ value }: { value: unknown }) => {
  if (value === undefined) return undefined;
  const parts = (Array.isArray(value) ? value : [value]).flatMap((v) =>
    typeof v === 'string' ? v.split(',') : [v],
  );
  return parts.map((p) => (typeof p === 'string' ? p.trim() : p)).filter((p) => p !== '');
};

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

/** `from` inclusive, `to` exclusive (ISO 8601; the client picks the day edges in the school's zone). */
class AuditPeriodDto extends AuditPageQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

/** `GET /audit` filters. */
export class AuditListQueryDto extends AuditPeriodDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsIn(AUDIT_MODULES)
  module?: AuditModule;

  /** One action or several (any of them): the action-type chips and the Settings filter. */
  @IsOptional()
  @Transform(list)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(AUDIT_ACTION_KEYS.length)
  @IsIn(AUDIT_ACTION_KEYS, { each: true })
  action?: AuditAction[];

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

/** A record's History: paging, who, and which field changed. */
export class AuditRecordQueryDto extends AuditPageQueryDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  /** A changed field's name (`basicSalary`, `school.workStart`). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  field?: string;
}

/** `GET /audit/actors` — everyone in the log, or the people who touched one record. */
export class AuditActorsQueryDto {
  @IsOptional()
  @IsIn(AUDIT_ENTITY_TYPES)
  entityType?: AuditEntityType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  entityId?: string;
}

/** `GET /audit/summary` — both edges required (the client sends today's, in the school's zone). */
export class AuditSummaryQueryDto {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;
}

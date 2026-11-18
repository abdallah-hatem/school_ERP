import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_RETENTION_LIMITS,
  NOTIFICATIONS_PAGE,
  type NotificationCategory,
} from '@school-erp/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** `GET /notifications?page&limit&status&category` — 20 per page by default, at most 50. */
export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATIONS_PAGE.maxLimit)
  limit?: number = NOTIFICATIONS_PAGE.defaultLimit;

  @IsOptional()
  @IsIn(['all', 'unread'])
  status?: 'all' | 'unread' = 'all';

  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORIES)
  category?: NotificationCategory;
}

/** `POST /notifications/read-all` — the moment the list was loaded (edge case 13). */
export class ReadAllNotificationsDto {
  @IsDateString({ strict: true })
  upTo!: string;
}

/**
 * One switch. `type` and `channel` are checked by the service (an unknown type → 400, a channel
 * that isn't live → 409 `CHANNEL_NOT_AVAILABLE`), so the error says which rule it broke.
 */
export class NotificationChoiceDto {
  @IsString()
  @MaxLength(100)
  type!: string;

  @IsString()
  @MaxLength(50)
  channel!: string;

  /** `null` = back to the school's default (preferences only). */
  @ValidateIf((_o, v) => v !== null)
  @IsBoolean()
  enabled!: boolean | null;
}

/** `PUT /notifications/preferences`. */
export class UpdateNotificationPreferencesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => NotificationChoiceDto)
  items!: NotificationChoiceDto[];
}

/** Retention in days, each 1–3650 (spec N14). */
export class NotificationRetentionDto {
  @IsOptional()
  @IsInt()
  @Min(NOTIFICATION_RETENTION_LIMITS.min)
  @Max(NOTIFICATION_RETENTION_LIMITS.max)
  readDays?: number;

  @IsOptional()
  @IsInt()
  @Min(NOTIFICATION_RETENTION_LIMITS.min)
  @Max(NOTIFICATION_RETENTION_LIMITS.max)
  resolvedDays?: number;

  @IsOptional()
  @IsInt()
  @Min(NOTIFICATION_RETENTION_LIMITS.min)
  @Max(NOTIFICATION_RETENTION_LIMITS.max)
  maxDays?: number;
}

/** `PUT /settings/notifications`. */
export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => NotificationChoiceDto)
  defaults?: NotificationChoiceDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationRetentionDto)
  retention?: NotificationRetentionDto;
}

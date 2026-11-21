import { LANGUAGES, type Language } from '@school-erp/shared';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** The browser's keys for encrypting alerts to it (`PushSubscription.toJSON().keys`). */
export class PushKeysDto {
  @IsString()
  @MaxLength(200)
  @Matches(BASE64URL)
  p256dh: string;

  @IsString()
  @MaxLength(100)
  @Matches(BASE64URL)
  auth: string;
}

/**
 * `POST /notifications/push-devices` — this browser's push subscription. The endpoint must be an
 * `https://` URL (the push services' are); plain `http://` only outside production, for the tests'
 * local push service.
 */
export class AddPushDeviceDto {
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/[^\s]+$/)
  endpoint: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;

  /** The app's language on this device: its alerts are written in it. */
  @IsIn(LANGUAGES)
  locale: Language;

  /** The browser's user agent (the web app's server calls the API, so the header is its own). */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}

/** `POST /notifications/push-devices/unsubscribe` — "Alerts on this device" turned off. */
export class RemovePushDeviceDto {
  @IsString()
  @MaxLength(2048)
  endpoint: string;
}

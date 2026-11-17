import { randomUUID } from 'node:crypto';
import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SettingsEvent,
  ErrorCode,
  LOGO_UPLOAD,
  type Paginated,
  type PublicSchoolSettings,
  type SchoolSettings,
  type SettingChangeItem,
  type SettingKey,
  type SettingsChangeScope,
  type SettingsChangedEvent,
  type SettingValueMap,
  type UploadLogoResponse,
} from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import type { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { FileStorageService } from './files/file-storage.service';
import { SchoolSettingRepository } from './repositories/school-setting.repository';
import { SettingChangeRepository } from './repositories/setting-change.repository';
import {
  IMAGE_MIME,
  LOGO_FOLDER,
  SCHOOL_FIELD_KEYS,
  detectImageType,
  diffValues,
  isWorkHoursOrdered,
  resolveValues,
  type SettingValues,
} from './settings.pure';

/** The uploaded file as multer hands it over (memory storage). */
export interface UploadedFileLike {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const SCHOOL_FIELDS = Object.keys(SCHOOL_FIELD_KEYS) as (keyof SchoolSettings)[];
const SCHOOL_KEYS = Object.values(SCHOOL_FIELD_KEYS);

/**
 * Typed settings over the `SchoolSetting` table. Every key falls back to its §7 default. Other
 * modules read and write their own keys through `getValues` / `setValues` (exported), so the
 * history and the after-commit event come for free.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly settings: SchoolSettingRepository,
    private readonly changes: SettingChangeRepository,
    private readonly files: FileStorageService,
    private readonly events: EventEmitter2,
  ) {}

  /** Current values of `keys`, defaults filled in. */
  async getValues<K extends SettingKey>(keys: readonly K[]): Promise<SettingValues<K>> {
    return resolveValues(keys, await this.settings.findByKeys(keys));
  }

  /**
   * Writes the keys whose value changed — all in one transaction — then, after the commit, emits
   * one `settings.changed` per changed key. Validate before calling. Returns what changed.
   */
  async setValues(
    scope: SettingsChangeScope,
    values: Partial<SettingValueMap>,
    changedById: string | null,
  ): Promise<SettingKey[]> {
    const keys = Object.keys(values) as SettingKey[];
    if (keys.length === 0) return [];
    const current = await this.getValues(keys);
    const diff = diffValues(current, values);
    if (diff.length === 0) return [];

    await this.settings.upsertMany(
      diff.map(({ key, newValue }) => ({ key, value: newValue })),
      changedById,
    );

    const changedAt = new Date().toISOString();
    for (const { key, oldValue, newValue } of diff) {
      const event: SettingsChangedEvent = {
        scope,
        key,
        oldValue,
        newValue,
        changedById,
        changedAt,
      };
      await this.events.emitAsync(SettingsEvent.CHANGED, event);
    }
    return diff.map((d) => d.key);
  }

  async getSchoolSettings(): Promise<SchoolSettings> {
    const values = await this.getValues(SCHOOL_KEYS);
    const out = {} as Record<keyof SchoolSettings, unknown>;
    for (const field of SCHOOL_FIELDS) out[field] = values[SCHOOL_FIELD_KEYS[field]];
    return out as SchoolSettings;
  }

  /** The identity a signed-out visitor may see (sign-in page): names, logo, language only. */
  async getPublicSchoolSettings(): Promise<PublicSchoolSettings> {
    const s = await this.getSchoolSettings();
    return {
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      logoUrl: s.logoUrl,
      defaultLanguage: s.defaultLanguage,
    };
  }

  async updateSchoolSettings(
    dto: UpdateSchoolSettingsDto,
    changedById: string | null,
  ): Promise<SchoolSettings> {
    const current = await this.getSchoolSettings();
    const workStart = dto.workStart ?? current.workStart;
    const workEnd = dto.workEnd ?? current.workEnd;
    if (!isWorkHoursOrdered(workStart, workEnd)) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_WORK_HOURS);
    }

    const values: Partial<SettingValueMap> = {};
    for (const field of SCHOOL_FIELDS) {
      const value = (dto as Partial<Record<keyof SchoolSettings, unknown>>)[field];
      if (field !== 'logoUrl' && value !== undefined) {
        (values as Record<string, unknown>)[SCHOOL_FIELD_KEYS[field]] = value;
      }
    }
    await this.setValues('school', values, changedById);
    return this.getSchoolSettings();
  }

  /** Stores a png / jpg / svg up to 2 MB and points `logoUrl` at it. */
  async setLogo(
    file: UploadedFileLike | undefined,
    changedById: string | null,
  ): Promise<UploadLogoResponse> {
    if (!file) throw new BadRequestException('file is required');
    if (file.size > LOGO_UPLOAD.maxBytes) {
      throw new CodedException(HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.FILE_TOO_LARGE);
    }
    const type = detectImageType(file.buffer);
    // Both the declared type and the real bytes must be an allowed image, and agree.
    if (!type || IMAGE_MIME[type] !== file.mimetype) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_FILE_TYPE);
    }

    const logoUrl = await this.files.save(LOGO_FOLDER, `logo-${randomUUID()}.${type}`, file.buffer);
    await this.setValues('school', { 'school.logoUrl': logoUrl }, changedById);
    return { logoUrl };
  }

  async listHistory(page: number, limit: number): Promise<Paginated<SettingChangeItem>> {
    const result = await this.changes.findPage(page, limit);
    return {
      ...result,
      data: result.data.map((row) => ({
        id: row.id,
        scope: row.scope.toLowerCase() as SettingsChangeScope,
        key: row.key,
        oldValue: row.oldValue,
        newValue: row.newValue,
        changedBy: row.changedBy,
        changedAt: row.changedAt.toISOString(),
      })),
    };
  }
}

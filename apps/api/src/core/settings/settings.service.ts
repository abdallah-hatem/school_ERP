import { randomUUID } from 'node:crypto';
import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  AuditEntityType,
  SETTINGS_HISTORY_ACTION_KEYS,
  SETTINGS_HISTORY_ACTIONS,
  SettingsEvent,
  ErrorCode,
  LOGO_UPLOAD,
  type AuditAction,
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
import { AfterCommit, type DbAdapter } from '../../database/transactions';
import { AuditService } from '../audit';
import type { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { FileStorageService } from './files/file-storage.service';
import { SchoolSettingRepository } from './repositories/school-setting.repository';
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

/** Who owns the keys a `setValues` call writes: core's school settings or HR's rules. */
export type SettingsOwner = Extract<SettingsChangeScope, 'school' | 'hr'>;

const OWNER_RECORD = {
  school: { type: AuditEntityType.SCHOOL_SETTINGS, id: 'school', label: '' },
  hr: { type: AuditEntityType.HR_SETTINGS, id: 'hr', label: '' },
} as const;

const OWNER_ACTION: Record<SettingsOwner, AuditAction> = {
  school: 'core.settings.update',
  hr: 'hr.settings.update',
};

/**
 * Typed settings over the `SchoolSetting` table. Every key falls back to its §7 default. Other
 * modules read and write their own keys through `getValues` / `setValues` (exported), so the
 * audit entry (in the same transaction, D2) and the after-commit event come for free.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly settings: SchoolSettingRepository,
    private readonly files: FileStorageService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<DbAdapter>,
    private readonly afterCommit: AfterCommit,
  ) {}

  /** Current values of `keys`, defaults filled in. */
  async getValues<K extends SettingKey>(keys: readonly K[]): Promise<SettingValues<K>> {
    return resolveValues(keys, await this.settings.findByKeys(keys));
  }

  /**
   * Writes the keys whose value changed and records one audit entry listing them, all in one
   * transaction (joining the caller's, if any). After the commit, emits one `settings.changed`
   * per changed key. Validate before calling. Returns what changed.
   */
  setValues(
    owner: SettingsOwner,
    values: Partial<SettingValueMap>,
    changedById: string | null,
  ): Promise<SettingKey[]> {
    return this.writeValues(OWNER_ACTION[owner], owner, values, changedById);
  }

  private async writeValues(
    action: AuditAction,
    owner: SettingsOwner,
    values: Partial<SettingValueMap>,
    changedById: string | null,
  ): Promise<SettingKey[]> {
    const keys = Object.keys(values) as SettingKey[];
    const diff = await this.txHost.withTransaction(async () => {
      const changed = keys.length > 0 ? diffValues(await this.getValues(keys), values) : [];
      if (changed.length > 0) {
        await this.settings.upsertMany(
          changed.map(({ key, newValue }) => ({ key, value: newValue })),
          changedById,
        );
      }
      // Always called: an unchanged save records nothing but still answers `@Audited` (D6b).
      await this.audit.record({
        action,
        entity: OWNER_RECORD[owner],
        changes: changed.map((d) => ({ field: d.key, before: d.oldValue, after: d.newValue })),
      });
      return changed;
    });

    const changedAt = new Date().toISOString();
    for (const { key, oldValue, newValue } of diff) {
      const event: SettingsChangedEvent = {
        scope: owner,
        key,
        oldValue,
        newValue,
        changedById,
        changedAt,
      };
      await this.afterCommit.run(() => this.events.emitAsync(SettingsEvent.CHANGED, event));
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
    await this.writeValues(
      'core.settings.logo_change',
      'school',
      { 'school.logoUrl': logoUrl },
      changedById,
    );
    return { logoUrl };
  }

  /**
   * Settings → Change history (§7), read from the audit log (D9): one item per changed key,
   * newest first — the same shape as before the move.
   */
  async listHistory(page: number, limit: number): Promise<Paginated<SettingChangeItem>> {
    const result = await this.audit.listChanges(SETTINGS_HISTORY_ACTION_KEYS, page, limit);
    return {
      ...result,
      data: result.data.map((row) => ({
        // One entry may list several keys; the first keeps the entry's id.
        id: row.ord === 1 ? row.id : `${row.id}:${row.ord}`,
        scope: SETTINGS_HISTORY_ACTIONS[row.action as keyof typeof SETTINGS_HISTORY_ACTIONS],
        key: row.change.field,
        oldValue: row.change.before,
        newValue: row.change.after,
        changedBy: row.actorId ? { id: row.actorId, name: row.actorName ?? '' } : null,
        changedAt: row.at.toISOString(),
      })),
    };
  }
}

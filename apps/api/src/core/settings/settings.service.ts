import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditEntityType,
  SettingsEvent,
  ErrorCode,
  LOGO_UPLOAD,
  type AuditAction,
  type PublicSchoolSettings,
  type SchoolSettings,
  type SettingKey,
  type SettingsChangeScope,
  type SettingValueMap,
  type UploadLogoResponse,
} from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import { AfterCommit } from '../../database/transactions';
import { AuditService } from '../audit';
import { DomainEvents } from '../events';
import type { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { FileStorageService } from './files/file-storage.service';
import { checkImageUpload, type UploadedFileLike } from './files/image-upload';
import { SchoolSettingRepository } from './repositories/school-setting.repository';
import {
  LOGO_FOLDER,
  SCHOOL_FIELD_KEYS,
  diffValues,
  isWorkHoursOrdered,
  resolveValues,
  type SettingValues,
} from './settings.pure';

export type { UploadedFileLike };

const SCHOOL_FIELDS = Object.keys(SCHOOL_FIELD_KEYS) as (keyof SchoolSettings)[];
const SCHOOL_KEYS = Object.values(SCHOOL_FIELD_KEYS);

/** Who owns the keys a `setValues` call writes: core's school settings, HR's or accounting's rules. */
export type SettingsOwner = Extract<SettingsChangeScope, 'school' | 'hr' | 'accounting'>;

const OWNER_RECORD = {
  school: { type: AuditEntityType.SCHOOL_SETTINGS, id: 'school', label: '' },
  hr: { type: AuditEntityType.HR_SETTINGS, id: 'hr', label: '' },
  accounting: { type: AuditEntityType.ACCOUNTING_SETTINGS, id: 'accounting', label: '' },
} as const;

const OWNER_ACTION: Record<SettingsOwner, AuditAction> = {
  school: 'core.settings.update',
  hr: 'hr.settings.update',
  accounting: 'accounting.settings.update',
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
    private readonly events: DomainEvents,
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
  ) {}

  /** Current values of `keys`, defaults filled in. */
  async getValues<K extends SettingKey>(keys: readonly K[]): Promise<SettingValues<K>> {
    return resolveValues(keys, await this.settings.findByKeys(keys));
  }

  /** When any of `keys` last changed (a save that changes nothing writes nothing), or null. */
  lastChangedAt(keys: readonly SettingKey[]): Promise<Date | null> {
    return this.settings.lastWrittenAt(keys);
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
    // Joins the caller's transaction, or (the seed) opens one with an after-commit queue.
    return this.afterCommit.inTransaction(async () => {
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
      const changedAt = new Date().toISOString();
      for (const { key, oldValue, newValue } of changed) {
        // Fire-and-forget, after the commit.
        await this.events.publish(SettingsEvent.CHANGED, {
          scope: owner,
          key,
          oldValue,
          newValue,
          changedById,
          changedAt,
        });
      }
      return changed.map((d) => d.key);
    });
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
    const { type, buffer } = checkImageUpload(file, LOGO_UPLOAD);

    return this.afterCommit.inTransaction(async () => {
      const logoUrl = await this.files.save(LOGO_FOLDER, `logo-${randomUUID()}.${type}`, buffer);
      // The file is written before the commit: a rolled-back change leaves no orphan (gap 8).
      this.afterCommit.onRollback(() => this.files.remove(logoUrl));
      await this.writeValues(
        'core.settings.logo_change',
        'school',
        { 'school.logoUrl': logoUrl },
        changedById,
      );
      return { logoUrl };
    });
  }
}

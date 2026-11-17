import type { Language, UserRole, Weekday } from '../enums';
import type { SettingKey } from '../settings';
import type { IsoDateTime, Names, TimeOfDay, Uuid } from './common';

// ── Auth — core/auth ───────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

/** `GET /auth/me`, and the `user` in login / refresh responses. */
export interface AuthUser {
  id: Uuid;
  email: string;
  name: string;
  role: UserRole;
}

export interface LoginResponse {
  user: AuthUser;
}
export type RefreshResponse = LoginResponse;
export type LogoutResponse = Record<string, never>;

// ── School settings — core/settings ────────────────────────────────────────

export interface SchoolSettings {
  nameEn: string;
  nameAr: string;
  logoUrl: string | null;
  defaultLanguage: Language;
  workStart: TimeOfDay;
  workEnd: TimeOfDay;
  workingDays: Weekday[];
}

/** `PATCH /settings/school` — any subset, no `logoUrl`. */
export type UpdateSchoolSettingsRequest = Partial<Omit<SchoolSettings, 'logoUrl'>>;

export interface UploadLogoResponse {
  logoUrl: string;
}

/** `GET /settings/history` item. */
export interface SettingChangeItem {
  key: SettingKey;
  oldValue: unknown;
  newValue: unknown;
  changedBy: { id: Uuid; name: string } | null;
  changedAt: IsoDateTime;
}

// ── School structure — core/school-structure ───────────────────────────────

/** Stage, department and job title share this shape. */
export interface ListItem extends Names {
  id: Uuid;
  sortOrder: number;
  isActive: boolean;
}

export type Stage = ListItem;

export interface CreateListItemRequest extends Names {
  sortOrder?: number;
}

export interface UpdateListItemRequest extends Partial<Names> {
  sortOrder?: number;
  isActive?: boolean;
}

export interface ListStagesQuery {
  includeHidden?: boolean;
}

import type { Language, UserRole, Weekday } from '../enums';
import type { SettingsChangeScope } from '../events';
import type { PermissionKey } from '../permissions';
import type { IsoDateTime, Names, TimeOfDay, Uuid } from './common';

// ── Auth — core/auth ───────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

/** The signed-in user (`req.user` in the API), and the `user` in login / refresh responses. */
export interface AuthUser {
  id: Uuid;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * `GET /auth/me`: the signed-in user with the permission keys they hold (R6). The web app hides
 * what the user can't do with them; the API's guard is the protection.
 */
export interface SessionUser extends AuthUser {
  permissions: PermissionKey[];
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

/** `GET /settings/school/public` — what a signed-out visitor (the sign-in page) may see. */
export type PublicSchoolSettings = Pick<
  SchoolSettings,
  'nameEn' | 'nameAr' | 'logoUrl' | 'defaultLanguage'
>;

export interface UploadLogoResponse {
  logoUrl: string;
}

/** `GET /settings/history` item. */
export interface SettingChangeItem {
  id: Uuid;
  scope: SettingsChangeScope;
  /** A `SettingKey` for rule settings; list and catalogue edits use their own keys. */
  key: string;
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

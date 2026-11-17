import type { Language, UserRole, Weekday } from '../enums';
import type { SettingsChangeScope } from '../events';
import type { PermissionKey, PermissionScope } from '../permissions';
import type { IsoDateTime, Names, PaginationQuery, TimeOfDay, Uuid } from './common';

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
  /**
   * @deprecated Since P2 access comes from roles as data (`user_roles`), never from this field;
   * it is kept only until the web app stops reading it (P3). Use `SessionUser.permissions`.
   */
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

// ── Users and roles — core/users, core/roles (spec roles-permissions, P2) ──

/** A role as it appears on a user. */
export interface RoleRef {
  id: Uuid;
  key: string;
  nameEn: string;
  nameAr: string;
}

/** One permission a role grants, with the rows it covers (R5). */
export interface RoleGrant {
  key: PermissionKey;
  scope: PermissionScope;
}

/** `GET /roles` item and `GET /roles/:id`. Permissions in registry order. */
export interface Role extends RoleRef {
  /** A starting role: can be edited, never deleted. */
  builtIn: boolean;
  permissions: RoleGrant[];
  /** Users holding the role (active or not). */
  userCount: number;
}

/** `POST /roles` — a custom role. Its key is generated. */
export interface CreateRoleRequest {
  nameEn: string;
  nameAr: string;
  permissions: RoleGrant[];
}

/** `PATCH /roles/:id` — `permissions`, when sent, replaces the whole set. */
export type UpdateRoleRequest = Partial<CreateRoleRequest>;

/** A user account, as the Users screen shows it. Never the password hash. */
export interface UserAccount {
  id: Uuid;
  name: string;
  email: string;
  isActive: boolean;
  /** Set when an admin gave a temporary password; cleared when the user changes it. */
  mustChangePassword: boolean;
  roles: RoleRef[];
  /** The linked employee (R9: at most one), or null. */
  employee: { id: Uuid; code: string; nameEn: string; nameAr: string } | null;
  createdAt: IsoDateTime;
}

/** `POST /users` — the password is temporary: the user is asked to change it. */
export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  roleIds: Uuid[];
  employeeId?: Uuid | null;
}

/** `PATCH /users/:id` — `roleIds`, when sent, replaces the user's roles. */
export interface UpdateUserRequest {
  name?: string;
  email?: string;
  roleIds?: Uuid[];
  employeeId?: Uuid | null;
}

/** `POST /users/:id/password` — an admin sets a temporary password; the user's sessions end. */
export interface SetTemporaryPasswordRequest {
  password: string;
}

/** `POST /account/password` — the signed-in user changes their own password. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** `GET /users` — `search` matches name or email. */
export interface ListUsersQuery extends PaginationQuery {
  status?: 'active' | 'inactive';
}

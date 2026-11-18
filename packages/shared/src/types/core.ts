import type { Language, Weekday } from '../enums';
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
   * Signed in with a temporary password (R9, spec P3): until they choose their own, the API answers
   * only `/auth/me`, sign-out and `POST /account/password` (403 `PASSWORD_CHANGE_REQUIRED`), and the
   * web app sends them to the "Set a new password" page.
   */
  mustChangePassword: boolean;
}

/**
 * `GET /auth/me`: the signed-in user with the permission keys they hold (R6) and the roles that
 * grant them (the name under the user chip). The web app hides what the user can't do with the
 * keys; the API's guard is the protection.
 */
export interface SessionUser extends AuthUser {
  permissions: PermissionKey[];
  roles: RoleRef[];
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

// ── School structure — core/school-structure ───────────────────────────────

/** Stage, department and job title share this shape. */
export interface ListItem extends Names {
  id: Uuid;
  sortOrder: number;
  isActive: boolean;
}

export interface Stage extends ListItem {
  /**
   * The "no stage" entry (§3: staff not tied to a stage): at most one stage, marked by the seed. It
   * keeps the role when renamed; employee cards give it the neutral band.
   */
  isNoStage: boolean;
}

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
  /** Their last successful sign-in, or null (never signed in). */
  lastSignInAt: IsoDateTime | null;
  /** When the password was last set (by an admin, or changed by the user); null before P3. */
  passwordChangedAt: IsoDateTime | null;
}

/**
 * `GET /users/employee-options` — the linked-employee picker on the user form: employees matching
 * the search, each with the account already linked to it (one employee, at most one account).
 */
export interface EmployeeOption {
  id: Uuid;
  code: string;
  nameEn: string;
  nameAr: string;
  jobTitle: Names;
  isActive: boolean;
  /** The account linked to this employee, or null. */
  linkedUser: { id: Uuid; name: string } | null;
}

/** `GET /users/employee-options` — `search` matches the name (either language) or the code. */
export interface EmployeeOptionsQuery extends PaginationQuery {
  search?: string;
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

/**
 * `POST /account/password` — the signed-in user changes their own password. `currentPassword` is
 * required, except right after signing in with a temporary password (`mustChangePassword`): that
 * sign-in just proved it. The new one must differ from the current one either way.
 */
export interface ChangePasswordRequest {
  currentPassword?: string;
  newPassword: string;
}

/** `GET /users` — `search` matches name or email; `roleId` keeps the holders of one role. */
export interface ListUsersQuery extends PaginationQuery {
  status?: 'active' | 'inactive';
  roleId?: Uuid;
}

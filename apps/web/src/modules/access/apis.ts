'use server';

import {
  PAGINATION,
  type CreateRoleRequest,
  type CreateUserRequest,
  type EmployeeOption,
  type EmployeeOptionsQuery,
  type ListUsersQuery,
  type Role,
  type UpdateRoleRequest,
  type UpdateUserRequest,
  type UserAccount,
  type Uuid,
} from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/*
 * Administration → Users, Roles and My account (contract → "Users and roles — core/users,
 * core/roles", spec roles-permissions P2/P3). Reads are tagged; every write revalidates what it
 * changed. A role change also changes who-holds-what on the users list, so role writes revalidate
 * both tags.
 */

const USERS_TAG = 'core-users';
const ROLES_TAG = 'core-roles';
const userTag = (id: Uuid) => `core-user-${id}`;
const roleTag = (id: Uuid) => `core-role-${id}`;

const str = (n: number | undefined) => (n === undefined ? undefined : String(n));
const path = (id: Uuid) => encodeURIComponent(id);

// ── Users ────────────────────────────────────────────────────────────────────

/** `GET /users` — the list with its search, role and status filters (server paging). */
export async function GET_USERS(query: ListUsersQuery = {}) {
  const response = await apiFetch<UserAccount[]>('/users', {
    params: {
      page: str(query.page),
      limit: str(query.limit),
      search: query.search || undefined,
      roleId: query.roleId,
      status: query.status,
    },
    next: { tags: [USERS_TAG] },
  });
  return handleResponse({ response });
}

export async function GET_USER(id: Uuid) {
  const response = await apiFetch<UserAccount>(`/users/${path(id)}`, {
    next: { tags: [USERS_TAG, userTag(id)] },
  });
  return handleResponse({ response });
}

export async function CREATE_USER(body: CreateUserRequest) {
  const response = await apiFetch<UserAccount>('/users', {
    method: 'POST',
    body: { ...body },
    revalidateTags: [USERS_TAG, ROLES_TAG],
  });
  return handleResponse({ response });
}

/** Only the fields that changed; `roleIds` replaces the user's roles. */
export async function UPDATE_USER(id: Uuid, body: UpdateUserRequest) {
  const response = await apiFetch<UserAccount>(`/users/${path(id)}`, {
    method: 'PATCH',
    body: { ...body },
    revalidateTags: [USERS_TAG, userTag(id), ROLES_TAG],
  });
  return handleResponse({ response });
}

export async function DEACTIVATE_USER(id: Uuid) {
  const response = await apiFetch<UserAccount>(`/users/${path(id)}/deactivate`, {
    method: 'POST',
    revalidateTags: [USERS_TAG, userTag(id)],
  });
  return handleResponse({ response });
}

export async function REACTIVATE_USER(id: Uuid) {
  const response = await apiFetch<UserAccount>(`/users/${path(id)}/reactivate`, {
    method: 'POST',
    revalidateTags: [USERS_TAG, userTag(id)],
  });
  return handleResponse({ response });
}

/** Unlocks a sign-in locked by too many wrong passwords, before the lock ends (owner 2026-11-18). */
export async function UNLOCK_SIGN_IN(id: Uuid) {
  const response = await apiFetch<UserAccount>(`/users/${path(id)}/unlock-sign-in`, {
    method: 'POST',
    revalidateTags: [USERS_TAG, userTag(id)],
  });
  return handleResponse({ response });
}

/** A temporary password: the user is signed out everywhere and must choose their own. */
export async function SET_TEMPORARY_PASSWORD(id: Uuid, password: string) {
  const response = await apiFetch<Record<string, never>>(`/users/${path(id)}/password`, {
    method: 'POST',
    body: { password },
    revalidateTags: [USERS_TAG, userTag(id)],
  });
  return handleResponse({ response });
}

/** `GET /users/employee-options` — the linked-employee picker (search on the server). */
export async function GET_EMPLOYEE_OPTIONS(query: EmployeeOptionsQuery = {}) {
  const response = await apiFetch<EmployeeOption[]>('/users/employee-options', {
    params: { page: str(query.page), limit: str(query.limit), search: query.search || undefined },
    cache: 'no-store',
  });
  return handleResponse({ response, showErrorToast: false });
}

// ── Roles ────────────────────────────────────────────────────────────────────

/** `GET /roles` — every role (a school has a handful), for the list, filters and checklists. */
export async function GET_ROLES() {
  const response = await apiFetch<Role[]>('/roles', {
    params: { limit: String(PAGINATION.maxLimit) },
    next: { tags: [ROLES_TAG] },
  });
  return handleResponse({ response });
}

export async function GET_ROLE(id: Uuid) {
  const response = await apiFetch<Role>(`/roles/${path(id)}`, {
    next: { tags: [ROLES_TAG, roleTag(id)] },
  });
  return handleResponse({ response });
}

export async function CREATE_ROLE(body: CreateRoleRequest) {
  const response = await apiFetch<Role>('/roles', {
    method: 'POST',
    body: { ...body },
    revalidateTags: [ROLES_TAG],
  });
  return handleResponse({ response });
}

/** `permissions`, when sent, replaces the whole set. */
export async function UPDATE_ROLE(id: Uuid, body: UpdateRoleRequest) {
  const response = await apiFetch<Role>(`/roles/${path(id)}`, {
    method: 'PATCH',
    body: { ...body },
    revalidateTags: [ROLES_TAG, roleTag(id), USERS_TAG],
  });
  return handleResponse({ response });
}

export async function DELETE_ROLE(id: Uuid) {
  const response = await apiFetch<Record<string, never>>(`/roles/${path(id)}`, {
    method: 'DELETE',
    revalidateTags: [ROLES_TAG, roleTag(id)],
  });
  return handleResponse({ response });
}

// ── My account ───────────────────────────────────────────────────────────────

/** `GET /account` — the signed-in user's own account. Never cached: it is per person. */
export async function GET_MY_ACCOUNT() {
  const response = await apiFetch<UserAccount>('/account', { cache: 'no-store' });
  return handleResponse({ response });
}

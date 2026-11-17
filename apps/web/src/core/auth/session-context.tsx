'use client';

import type { SessionUser } from '@school-erp/shared';
import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { can, type PermissionRequirement } from './permissions';

const SessionContext = createContext<SessionUser | null>(null);

/**
 * The signed-in user for client components. The dashboard layout reads the session on the server
 * (`getSession()`) and passes it here, so the first paint already shows only what they may use.
 */
export function SessionProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** The signed-in user, or null (signed out, or outside the dashboard). */
export function useSession(): SessionUser | null {
  return useContext(SessionContext);
}

/** `can(key)` for the signed-in user — view only; the API decides. */
export function useCan(): (required: PermissionRequirement) => boolean {
  const user = useSession();
  return useCallback((required: PermissionRequirement) => can(user, required), [user]);
}

/**
 * Renders `children` only when the signed-in user holds `permission` (several keys: all of them),
 * else `fallback`. View only — the API still refuses the action.
 *
 * @example <Can permission="hr.penalties.approve"><Button>Approve</Button></Can>
 */
export function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: PermissionRequirement;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return <>{useCan()(permission) ? children : fallback}</>;
}

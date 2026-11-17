import type { AuthUser } from '@school-erp/shared';
import { cache } from 'react';
import { GET_ME } from './apis';

/**
 * The signed-in user for a Server Component (a layout hands it to the client as initial state,
 * so the first paint is already this person's screen). Null when there is no valid session.
 * Cached per request.
 */
export const getSession = cache(async (): Promise<AuthUser | null> => {
  const res = await GET_ME();
  return res.success && res.data ? res.data : null;
});

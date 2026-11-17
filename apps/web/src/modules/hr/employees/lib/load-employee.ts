import type { Employee } from '@school-erp/shared';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { GET_EMPLOYEE } from '../apis';

/**
 * Server: the employee for a profile or edit page. An unknown (404) or malformed (400) id is the
 * not-found page; any other failure throws to the route's error boundary, which offers a retry.
 * Cached per request, so everything in one render shares a single GET.
 */
export const loadEmployee = cache(async (id: string): Promise<Employee> => {
  const res = await GET_EMPLOYEE(id);
  if (res.success === false && (res.status === 404 || res.status === 400)) notFound();
  if (!res.success || !res.data) throw new Error(res.message ?? 'Employee failed to load');
  return res.data;
});

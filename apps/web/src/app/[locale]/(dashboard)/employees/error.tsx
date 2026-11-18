'use client';

import { RouteError } from '@/shared/components/layout/route-error';

/** A profile or form that failed to load: say so and offer a retry, never a blank screen. */
export default function EmployeesError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError reset={reset} />;
}

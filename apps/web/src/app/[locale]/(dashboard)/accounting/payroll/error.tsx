'use client';

import { RouteError } from '@/shared/components/layout/route-error';

/** The approved months or one month that failed to load: say so and offer a retry, never a blank screen. */
export default function AccountingPayrollError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError reset={reset} />;
}

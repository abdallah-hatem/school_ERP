'use client';

import { RouteError } from '@/shared/components/layout/route-error';

/** A run or payslip that failed to load: say so and offer a retry, never a blank screen. */
export default function PayrollError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError reset={reset} />;
}

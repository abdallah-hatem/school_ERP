'use client';

import { RouteError } from '@/shared/components/layout/route-error';

/** The year board or a statement that failed to load: say so and offer a retry, never a blank screen. */
export default function PayrollTaxesError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError reset={reset} />;
}

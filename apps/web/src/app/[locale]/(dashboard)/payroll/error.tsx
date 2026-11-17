'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ErrorState } from '@/shared/components/layout/empty-state';

/** A run or payslip that failed to load: say so and offer a retry, never a blank screen. */
export default function PayrollError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();
  return (
    <div className="bg-card shadow-card rounded-3xl">
      <ErrorState
        retrying={retrying}
        onRetry={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
      />
    </div>
  );
}

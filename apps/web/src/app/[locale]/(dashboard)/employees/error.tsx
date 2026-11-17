'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ErrorState } from '@/shared/components/layout/empty-state';

/** A profile or form that failed to load: say so and offer a retry, never a blank screen. */
export default function EmployeesError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();
  return (
    <div className="rounded-3xl bg-card shadow-card">
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

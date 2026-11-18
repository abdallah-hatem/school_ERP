'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ErrorState } from './empty-state';

/**
 * A route's `error.tsx` body: a page that failed to load says so and offers a retry (refetching the
 * server render), never a blank screen.
 */
export function RouteError({ reset }: { reset: () => void }) {
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

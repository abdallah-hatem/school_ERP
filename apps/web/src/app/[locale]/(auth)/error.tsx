'use client';

import { RouteError } from '@/shared/components/layout/route-error';

/**
 * Sign-in and Set a new password, when their page fails to render: the same error screen, without
 * "Back to the dashboard" (out of reach signed out).
 */
export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-4 py-8">
      <RouteError error={error} reset={reset} showHome={false} />
    </main>
  );
}

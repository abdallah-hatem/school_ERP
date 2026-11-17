'use client';

import { AuditTimelineSkeleton } from '@/core/audit';
import { Skeleton, SkeletonText } from '@/shared/components/ui/skeleton';

/**
 * The Activity page while it loads: header, search, a page of the timeline (10 entries under day
 * headers) and the filters panel — the same boxes the page draws, so nothing moves when it lands.
 * No translated text: `loading.tsx` renders it before the page's messages are known.
 */
export function ActivitySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div aria-hidden="true" className="flex flex-col gap-1">
        <SkeletonText className="font-display text-2xl leading-tight md:text-3xl" width="w-32" />
        <SkeletonText className="text-sm" width="w-96" />
      </div>
      <div className="@container/activity">
        <div className="grid items-start gap-5 @min-[56rem]/activity:grid-cols-[minmax(0,1fr)_18.75rem]">
          <div className="flex min-w-0 flex-col gap-3.5">
            <div aria-hidden="true" className="flex gap-2">
              <Skeleton className="h-11 flex-1 rounded-xl" />
              <Skeleton className="h-11 w-14 rounded-xl @min-[56rem]/activity:hidden" />
            </div>
            <div aria-hidden="true" className="px-1 @min-[56rem]/activity:hidden">
              <SkeletonText className="text-[0.8125rem]" width="w-20" />
            </div>
            <div className="@container min-w-0 rounded-3xl bg-card shadow-card">
              <AuditTimelineSkeleton grouping="day" />
              <div aria-hidden="true" className="flex items-center justify-between border-t border-border px-4 py-3.5 sm:px-5">
                <SkeletonText className="text-sm" width="w-32" />
                <Skeleton className="h-9 w-48 rounded-lg" />
              </div>
            </div>
          </div>
          <div
            aria-hidden="true"
            className="hidden flex-col gap-4.5 rounded-3xl bg-card p-4.5 shadow-card @min-[56rem]/activity:flex"
          >
            <SkeletonText className="font-display text-base" width="w-20" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <SkeletonText className="text-xs" width="w-16" />
                <Skeleton className={i === 2 ? 'h-16 rounded-xl' : 'h-10 rounded-xl'} />
              </div>
            ))}
            <div className="flex flex-col gap-2">
              <SkeletonText className="text-xs" width="w-14" />
              <Skeleton className="h-56 rounded-2xl" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

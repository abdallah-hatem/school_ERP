import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * A titled card of the Users / Roles / My account pages: heading (with an optional quiet note
 * after it, e.g. "· Optional"), a one-line hint, then its content. `id` names the heading for
 * `aria-labelledby`.
 */
export function FormCard({
  title,
  titleId,
  note,
  hint,
  aside,
  measure,
  children,
  className,
}: {
  title: ReactNode;
  titleId?: string;
  note?: ReactNode;
  hint?: ReactNode;
  /** Right of the heading (a count, a link). */
  aside?: ReactNode;
  /** `width`: its height follows the data (a list of roles or holders) — the skeleton spec compares its width only. */
  measure?: 'width';
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-skeleton-block="form-card"
      data-skeleton-measure={measure}
      aria-labelledby={titleId}
      className={cn('@container flex min-w-0 flex-col gap-4 rounded-3xl bg-card p-5 shadow-card md:p-6', className)}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id={titleId} className="font-display text-lg font-extrabold">
            {title}
            {note ? <span className="ms-1.5 font-sans text-[0.8rem] font-medium text-muted-foreground">· {note}</span> : null}
          </h2>
          {aside}
        </div>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Two columns on a wide content area (main + side), one below it. `sideFirst`: below the two-column
 * width the side column comes first (a user's Status, with a locked sign-in, must not sit under the
 * whole form on a phone). It is first in the DOM too, so reading and focus order follow what is
 * seen; on a wide area it is placed back in the second column.
 */
export function FormColumns({ main, side, sideFirst = false }: { main: ReactNode; side: ReactNode; sideFirst?: boolean }) {
  const mainColumn = (
    <div className={cn('flex min-w-0 flex-col gap-5', sideFirst && '@min-[1000px]:col-start-1 @min-[1000px]:row-start-1')}>
      {main}
    </div>
  );
  const sideColumn = (
    <div className={cn('flex min-w-0 flex-col gap-5', sideFirst && '@min-[1000px]:col-start-2 @min-[1000px]:row-start-1')}>
      {side}
    </div>
  );
  return (
    <div className="@container">
      <div className="grid items-start gap-5 @min-[1000px]:grid-cols-[minmax(0,1fr)_21rem]">
        {sideFirst ? sideColumn : mainColumn}
        {sideFirst ? mainColumn : sideColumn}
      </div>
    </div>
  );
}

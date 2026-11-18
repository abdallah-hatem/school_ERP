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

/** Two columns on a wide content area (main + side), one below it. */
export function FormColumns({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid items-start gap-5 @min-[1000px]:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col gap-5">{main}</div>
        <div className="flex min-w-0 flex-col gap-5">{side}</div>
      </div>
    </div>
  );
}

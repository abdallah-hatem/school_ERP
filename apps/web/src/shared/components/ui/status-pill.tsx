import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import type { AppIcon } from './icons';

/** Tone carries meaning, not decoration: success = done, warning = needs a look, danger = blocked. */
const tones = {
  neutral: 'bg-neutral-soft text-neutral-ink',
  primary: 'bg-primary-soft text-primary',
  accent: 'bg-accent-soft text-accent-foreground',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-destructive-soft text-destructive-ink',
  info: 'bg-info-soft text-info-ink',
} as const;
export type StatusTone = keyof typeof tones;

export function StatusPill({
  tone = 'neutral',
  icon: Icon,
  hollow = false,
  children,
  className,
}: {
  tone?: StatusTone;
  /** Without an icon the pill shows a dot. */
  icon?: AppIcon;
  /** A hollow dot (an "off" state such as inactive), so it differs by shape too, not only colour. */
  hollow?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full py-1 ps-2 pe-2.5 text-xs font-bold whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-4" /> : <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', hollow ? 'border-[1.5px] border-current' : 'bg-current')}
        />}
      {children}
    </span>
  );
}

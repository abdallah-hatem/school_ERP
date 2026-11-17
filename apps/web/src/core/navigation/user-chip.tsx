'use client';

import type { AuthUser } from '@school-erp/shared';
import { signOut } from '@/core/auth';
import { SignOutIcon } from '@/shared/components/ui/icons';
import { initialsOf as initials } from '@/shared/lib/initials';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * The signed-in person at the bottom of the menu: initials, name, role and a sign-out button.
 * `compact` (the tablet icon rail): only the initials (the name is their tooltip) with sign-out
 * under them.
 */
export function UserChip({ user, compact = false }: { user: AuthUser; compact?: boolean }) {
  const { t, locale } = useTranslation();
  const role = t(`common.enums.userRole.${user.role}`);
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-2xl border border-border bg-muted p-2.5',
        compact && 'flex-col gap-1.5 border-0 bg-transparent p-0',
      )}
    >
      <span
        aria-hidden="true"
        title={compact ? user.name : undefined}
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent font-display text-[0.8rem] font-extrabold text-accent-foreground"
      >
        {initials(user.name)}
      </span>
      <span className={cn('flex min-w-0 flex-1 flex-col', compact && 'sr-only')}>
        <span className="truncate text-[0.8rem] leading-tight font-bold">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{role}</span>
      </span>
      <form action={signOut.bind(null, locale)}>
        <button
          type="submit"
          aria-label={t('common.actions.signOut')}
          title={t('common.actions.signOut')}
          className="grid size-9 cursor-pointer place-items-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
        >
          <SignOutIcon className="flip-rtl size-[1.1rem]" />
        </button>
      </form>
    </div>
  );
}

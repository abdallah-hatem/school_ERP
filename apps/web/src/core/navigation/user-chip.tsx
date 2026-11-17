'use client';

import type { SessionUser } from '@school-erp/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/core/auth';
import { SignOutIcon } from '@/shared/components/ui/icons';
import { localName } from '@/shared/lib/i18n';
import { initialsOf as initials } from '@/shared/lib/initials';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** Path of My account under the locale. */
export const ACCOUNT_PATH = '/account';

/**
 * The signed-in person at the bottom of the menu: initials, name and the names of their roles
 * (in the screen's language), opening My account, with a sign-out button beside it.
 * `compact` (the tablet icon rail): only the initials (the name is their tooltip) with sign-out
 * under them.
 */
export function UserChip({ user, compact = false }: { user: SessionUser; compact?: boolean }) {
  const { t, locale } = useTranslation();
  const pathname = usePathname() ?? '';
  const href = `/${locale}${ACCOUNT_PATH}`;
  const current = pathname === href || pathname.startsWith(`${href}/`);
  const roles = user.roles.length
    ? user.roles.map((r) => localName(r, locale)).join(t('common.nav.roleSeparator'))
    : t('common.nav.noRoles');
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-2xl border border-border bg-muted p-1.5',
        current && 'border-primary-soft bg-primary-soft',
        compact && 'flex-col gap-1.5 border-0 bg-transparent p-0',
      )}
    >
      <Link
        href={href}
        aria-current={current ? 'page' : undefined}
        aria-label={compact ? t('common.nav.myAccountOf', { name: user.name }) : undefined}
        title={compact ? user.name : undefined}
        className={cn(
          'flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl p-1 transition-colors duration-150 hover:bg-secondary',
          compact && 'flex-none p-0 hover:bg-transparent',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl bg-accent font-display text-[0.8rem] font-extrabold text-accent-foreground',
            compact && current && 'ring-2 ring-primary',
          )}
        >
          {initials(user.name)}
        </span>
        <span className={cn('flex min-w-0 flex-1 flex-col', compact && 'sr-only')}>
          <span className="truncate text-[0.8rem] leading-tight font-bold">{user.name}</span>
          <span data-testid="user-chip-roles" className="truncate text-xs text-muted-foreground" title={roles}>
            {current ? t('common.nav.myAccount') : roles}
          </span>
        </span>
      </Link>
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

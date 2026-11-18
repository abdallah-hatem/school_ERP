'use client';

import { SYSTEM_ADMIN_ROLE, isBuiltInRole, type RoleRef, type UserAccount } from '@school-erp/shared';
import { PersonAvatar } from '@/shared/components/ui/person-avatar';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { CustomRoleIcon, LockedIcon, RolesIcon, SystemAdminIcon, type AppIcon } from '@/shared/components/ui/icons';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/*
 * Small pieces the Users and Roles screens share: a role's chip, its kind (built-in / custom) and
 * a stack of the avatars of who holds it.
 */

export type RoleKind = 'system' | 'builtIn' | 'custom';

/** System admin, another starting role, or one the school made. */
export function roleKind(role: Pick<RoleRef, 'key'>): RoleKind {
  if (role.key === SYSTEM_ADMIN_ROLE) return 'system';
  return isBuiltInRole(role.key) ? 'builtIn' : 'custom';
}

const KIND_ICON: Record<RoleKind, AppIcon> = { system: SystemAdminIcon, builtIn: RolesIcon, custom: CustomRoleIcon };
const KIND_TILE: Record<RoleKind, string> = {
  system: 'bg-accent-soft text-accent-foreground',
  builtIn: 'bg-primary-soft text-primary',
  custom: 'bg-info-soft text-info-ink',
};
const KIND_CHIP: Record<RoleKind, string> = {
  system: 'bg-accent-soft text-accent-foreground',
  builtIn: 'bg-primary-soft text-primary',
  custom: 'bg-info-soft text-info-ink',
};

/** A role's name as a chip, coloured by its kind (the System admin with its shield). */
export function RoleChip({ role, className }: { role: RoleRef; className?: string }) {
  const { locale } = useTranslation();
  const kind = roleKind(role);
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
        KIND_CHIP[kind],
        className,
      )}
    >
      {kind === 'system' ? <SystemAdminIcon className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{localName(role, locale)}</span>
    </span>
  );
}

/** The roles a user holds, wrapping. */
export function RoleChips({ roles, className }: { roles: RoleRef[]; className?: string }) {
  if (roles.length === 0) return null;
  return (
    <span className={cn('flex min-w-0 flex-wrap gap-1.5', className)}>
      {roles.map((r) => (
        <RoleChip key={r.id} role={r} />
      ))}
    </span>
  );
}

/** "Built-in" / "Custom" beside a role's name. */
export function RoleKindBadge({ builtIn }: { builtIn: boolean }) {
  const { t } = useTranslation();
  return builtIn ? (
    <StatusPill tone="neutral" icon={LockedIcon}>
      {t('access.roles.builtIn')}
    </StatusPill>
  ) : (
    <StatusPill tone="info" icon={CustomRoleIcon}>
      {t('access.roles.custom')}
    </StatusPill>
  );
}

/** The role's icon tile (shield star / shield / sparkle). */
export function RoleTile({ role, className }: { role: Pick<RoleRef, 'key'>; className?: string }) {
  const kind = roleKind(role);
  const Icon = KIND_ICON[kind];
  return (
    <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-xl', KIND_TILE[kind], className)}>
      <Icon className="size-5" />
    </span>
  );
}

/** A user who holds a role, as its avatar stack needs them. */
export type RoleHolder = Pick<UserAccount, 'id' | 'employee' | 'isActive'>;

/** Up to `max` holders' avatars, overlapping (who holds a role); inactive ones greyed. */
export function AvatarStack({ people, max = 3 }: { people: RoleHolder[]; max?: number }) {
  if (people.length === 0) return null;
  return (
    <span aria-hidden="true" className="flex -space-x-2 rtl:space-x-reverse">
      {people.slice(0, max).map((p) => (
        <PersonAvatar
          key={p.id}
          photoUrl={p.employee?.photoUrl}
          gender={p.employee?.gender}
          muted={!p.isActive}
          size="xs"
          className="ring-2 ring-card"
        />
      ))}
    </span>
  );
}

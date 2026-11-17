'use client';

import { EmptyState } from '@/shared/components/layout/empty-state';
import { BlockedIcon, EmptyIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * In place of a page the person can't open (no `core.users.view` / `core.roles.view` — the API
 * would refuse it anyway), or a user or role that isn't there.
 */
export function AccessState({ kind }: { kind: 'users' | 'roles' | 'notFound' }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-3xl bg-card shadow-card">
      {kind === 'notFound' ? (
        <EmptyState icon={EmptyIcon} title={t('access.noAccess.notFoundTitle')} description={t('access.noAccess.notFoundBody')} />
      ) : (
        <EmptyState
          icon={BlockedIcon}
          title={t(kind === 'users' ? 'access.noAccess.usersTitle' : 'access.noAccess.rolesTitle')}
          description={t('access.noAccess.body')}
        />
      )}
    </div>
  );
}

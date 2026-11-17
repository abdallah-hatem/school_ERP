'use client';

import { EmptyState } from '@/shared/components/layout/empty-state';
import { BlockedIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** Shown instead of the log to someone without `core.audit.view` (the API would refuse anyway). */
export function NoAuditAccess() {
  const { t } = useTranslation();
  return (
    <div className="rounded-3xl bg-card shadow-card">
      <EmptyState icon={BlockedIcon} title={t('audit.activity.noAccessTitle')} description={t('audit.activity.noAccessBody')} />
    </div>
  );
}

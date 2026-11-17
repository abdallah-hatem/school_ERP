'use client';

import { EmptyState } from '@/shared/components/layout/empty-state';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * Inside the shell: a record that doesn't exist, one outside the viewer's scope (the API answers
 * 404, edge case 3), or a page their roles can't open (`requirePermission`, R6). The same screen
 * for all three, so it never tells whether something exists.
 */
export default function DashboardNotFound() {
  const { t } = useTranslation();
  return (
    <div className="rounded-3xl bg-card shadow-card">
      <EmptyState title={t('ui.states.notFoundTitle')} description={t('ui.states.notFoundBody')} />
    </div>
  );
}

'use client';

import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { NAV_ITEMS, type NavItem } from './nav-items';

/** Placeholder for a menu entry whose screen hasn't landed yet. Replaced by the module's page. */
export function ComingSoon({ section }: { section: NavItem['key'] }) {
  const { t } = useTranslation();
  const item = NAV_ITEMS.find((i) => i.key === section);
  return (
    <>
      <PageHeader title={t(`common.nav.${section}`)} />
      <div className="rounded-3xl bg-card shadow-card">
        <EmptyState icon={item?.icon} title={t('ui.comingSoon.title')} description={t('ui.comingSoon.body')} />
      </div>
    </>
  );
}

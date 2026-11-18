'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { settingsActivityHref } from '@/core/audit';
import { Can, useCan } from '@/core/auth';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import {
  AccountingModuleIcon,
  ChevronEndIcon,
  ChevronStartIcon,
  HistoryIcon,
  ListsIcon,
  PenaltiesIcon,
  RulesIcon,
  SchoolIcon,
  StructureIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { DirtyReporterProvider, useLeaveGuard } from '../hooks/unsaved-changes';
import { SECTION_VIEW_PERMISSION, SETTINGS_SECTIONS, type SettingsSectionId } from '../sections';
import { AccountingRulesSection } from './accounting-rules-section';
import { CatalogueSection } from './catalogue-section';
import { HrRulesSection } from './hr-rules-section';
import { ListManager } from './list-manager';
import { SchoolSection } from './school-section';

const ICONS: Record<SettingsSectionId, AppIcon> = {
  school: SchoolIcon,
  structure: StructureIcon,
  lists: ListsIcon,
  hrRules: RulesIcon,
  catalogue: PenaltiesIcon,
  accounting: AccountingModuleIcon,
};

function SectionBody({ id }: { id: SettingsSectionId }): ReactNode {
  switch (id) {
    case 'school':
      return <SchoolSection />;
    case 'structure':
      return <ListManager kind="stages" />;
    case 'lists':
      return (
        <div className="flex flex-col gap-6">
          <ListManager kind="departments" />
          <ListManager kind="jobTitles" />
        </div>
      );
    case 'hrRules':
      return <HrRulesSection />;
    case 'catalogue':
      return <CatalogueSection />;
    case 'accounting':
      return <AccountingRulesSection />;
  }
}

type Leave = { to: SettingsSectionId | null } | { href: string } | { proceed: () => void };

/**
 * The one Settings screen (§7): a section per area. Desktop and tablet show the sections as a side
 * list beside the open one; a phone shows the list first, then the chosen section with a way back.
 * Leaving a section with unsaved edits — another section, a menu link, the language switch,
 * closing the tab — asks first. Only the sections the user may view are listed; a section they can't
 * view (from the URL) opens their first allowed one instead.
 */
export function SettingsScreen({ initialSection }: { initialSection: SettingsSectionId | null }) {
  const { t, locale } = useTranslation();
  const can = useCan();
  const router = useRouter();
  const pathname = usePathname();
  const visible = useMemo(() => SETTINGS_SECTIONS.filter((id) => can(SECTION_VIEW_PERMISSION[id])), [can]);
  const refused = initialSection !== null && !visible.includes(initialSection);
  const [section, setSection] = useState<SettingsSectionId | null>(refused ? null : initialSection);
  const [dirtyBy, setDirtyBy] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState<Leave | null>(null);
  const dirty = Object.values(dirtyBy).some(Boolean);
  // The page itself needs one of the sections' permissions, so there is always a first one.
  const first = visible[0] ?? SETTINGS_SECTIONS[0];
  const shown = section ?? first;

  // A section they can't view was asked for: drop it from the URL (the first allowed one shows).
  useEffect(() => {
    if (refused) router.replace(pathname ?? '', { scroll: false });
  }, [refused, router, pathname]);

  const report = useCallback((source: string, isDirty: boolean) => {
    setDirtyBy((prev) => (Boolean(prev[source]) === isDirty ? prev : { ...prev, [source]: isDirty }));
  }, []);
  const onLeaveAttempt = useCallback(
    (target: string | (() => void)) =>
      setLeaving(typeof target === 'string' ? { href: target } : { proceed: target }),
    [],
  );
  useLeaveGuard(dirty, onLeaveAttempt);

  function open(to: SettingsSectionId | null) {
    setSection(to);
    router.replace(to ? `${pathname}?section=${to}` : (pathname ?? ''), { scroll: false });
  }

  function choose(to: SettingsSectionId | null) {
    if (to === section) return;
    if (dirty && (to ?? first) !== shown) setLeaving({ to });
    else open(to);
  }

  function leave() {
    const target = leaving;
    if (!target) return;
    setDirtyBy({});
    if ('href' in target) router.push(target.href);
    else if ('proceed' in target) target.proceed();
    else open(target.to);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
        actions={
          // Change history lives in the activity log (audit spec D9, owner 2026-11-17).
          <Can permission="core.audit.view">
            <Button asChild variant="secondary">
              <Link href={settingsActivityHref(locale)}>
                <HistoryIcon />
                {t('settings.viewHistory')}
              </Link>
            </Button>
          </Can>
        }
      />
      <div className="grid items-start gap-6 md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label={t('settings.sectionsLabel')} className={cn('md:sticky md:top-6', section && 'max-md:hidden')}>
          <ul className="flex flex-col gap-1 rounded-3xl bg-card p-2 shadow-card">
            {visible.map((id) => {
              const Icon = ICONS[id];
              const current = id === shown;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={current ? 'page' : undefined}
                    onClick={() => choose(id)}
                    className={cn(
                      'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-start text-sm font-semibold transition-colors duration-150',
                      'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
                      current ? 'md:bg-primary-soft md:text-primary' : 'text-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span>{t(`settings.sections.${id}.title`)}</span>
                      <span className="text-xs font-normal text-muted-foreground md:hidden">
                        {t(`settings.sections.${id}.description`)}
                      </span>
                    </span>
                    <ChevronEndIcon className="flip-rtl size-4 shrink-0 text-muted-foreground md:hidden" />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={cn('flex min-w-0 flex-col gap-4', !section && 'max-md:hidden')}>
          {section ? (
            <Button variant="ghost" size="sm" className="self-start md:hidden" onClick={() => choose(null)}>
              <ChevronStartIcon className="flip-rtl" />
              {t('settings.allSections')}
            </Button>
          ) : null}
          <DirtyReporterProvider value={report}>
            <SectionBody key={shown} id={shown} />
          </DirtyReporterProvider>
        </div>
      </div>

      <ConfirmDialog
        open={leaving !== null}
        onOpenChange={(o) => !o && setLeaving(null)}
        title={t('settings.unsaved.title')}
        description={t('settings.unsaved.body')}
        confirmLabel={t('settings.unsaved.discard')}
        tone="destructive"
        onConfirm={leave}
      />
    </div>
  );
}

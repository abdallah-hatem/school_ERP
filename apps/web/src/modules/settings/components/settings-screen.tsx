'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import {
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
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../sections';
import { CatalogueSection } from './catalogue-section';
import { HistorySection } from './history-section';
import { HrRulesSection } from './hr-rules-section';
import { ListManager } from './list-manager';
import { SchoolSection } from './school-section';

const ICONS: Record<SettingsSectionId, AppIcon> = {
  school: SchoolIcon,
  structure: StructureIcon,
  lists: ListsIcon,
  hrRules: RulesIcon,
  catalogue: PenaltiesIcon,
  history: HistoryIcon,
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
    case 'history':
      return <HistorySection />;
  }
}

type Leave = { to: SettingsSectionId | null } | { href: string };

/**
 * The one Settings screen (§7): a section per area. Desktop and tablet show the sections as a side
 * list beside the open one; a phone shows the list first, then the chosen section with a way back.
 * Leaving a section with unsaved edits — another section, a menu link, closing the tab — asks first.
 */
export function SettingsScreen({ initialSection }: { initialSection: SettingsSectionId | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [section, setSection] = useState<SettingsSectionId | null>(initialSection);
  const [dirtyBy, setDirtyBy] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState<Leave | null>(null);
  const dirty = Object.values(dirtyBy).some(Boolean);
  const shown = section ?? SETTINGS_SECTIONS[0];

  const report = useCallback((source: string, isDirty: boolean) => {
    setDirtyBy((prev) => (Boolean(prev[source]) === isDirty ? prev : { ...prev, [source]: isDirty }));
  }, []);
  const onLeaveAttempt = useCallback((href: string) => setLeaving({ href }), []);
  useLeaveGuard(dirty, onLeaveAttempt);

  function open(to: SettingsSectionId | null) {
    setSection(to);
    router.replace(to ? `${pathname}?section=${to}` : (pathname ?? ''), { scroll: false });
  }

  function choose(to: SettingsSectionId | null) {
    if (to === section) return;
    if (dirty && (to ?? SETTINGS_SECTIONS[0]) !== shown) setLeaving({ to });
    else open(to);
  }

  function leave() {
    const target = leaving;
    if (!target) return;
    setDirtyBy({});
    if ('href' in target) router.push(target.href);
    else open(target.to);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <div className="grid items-start gap-6 md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label={t('settings.sectionsLabel')} className={cn('md:sticky md:top-6', section && 'max-md:hidden')}>
          <ul className="flex flex-col gap-1 rounded-3xl bg-card p-2 shadow-card">
            {SETTINGS_SECTIONS.map((id) => {
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

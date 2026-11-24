'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { parseSettingsPart, visibleSettingsSections, type SettingsPartId } from '@school-erp/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { settingsActivityHref } from '@/core/audit';
import { Can, useSession } from '@/core/auth';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import {
  AccountingModuleIcon,
  ChevronEndIcon,
  ChevronStartIcon,
  HistoryIcon,
  ListsIcon,
  NotificationsIcon,
  PenaltiesIcon,
  RulesIcon,
  SchoolIcon,
  StructureIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';
import { TAB_HOVER_FADE } from '@/shared/lib/tab-motion';
import { scrollToTopOf, useRevealTopOnChange } from '@/shared/hooks/use-reveal-top';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { DirtyReporterProvider, useLeaveGuard } from '../hooks/unsaved-changes';
import { parseSection, type SettingsSectionId } from '../sections';
import { AccountingRulesSection } from './accounting-rules-section';
import { CatalogueSection } from './catalogue-section';
import { HrRulesSection } from './hr-rules-section';
import { ListManager } from './list-manager';
import { NotificationsSection } from './notifications-section';
import { SchoolSection } from './school-section';

const ICONS: Record<SettingsSectionId, AppIcon> = {
  school: SchoolIcon,
  structure: StructureIcon,
  lists: ListsIcon,
  hrRules: RulesIcon,
  catalogue: PenaltiesIcon,
  accounting: AccountingModuleIcon,
  notifications: NotificationsIcon,
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
    case 'notifications':
      return <NotificationsSection />;
  }
}

/**
 * Moves focus to the open section's first heading, without scrolling. A section draws its loading
 * shape first and its loaded form after, which replaces the heading — so for a moment the focus
 * follows the newest first heading, until the person does anything (a key, a tap) or 3 s pass.
 */
function focusFirstHeading(body: HTMLElement) {
  const heading = () => body.querySelector<HTMLElement>('h2[tabindex]');
  const start = document.activeElement;
  const ours = () => {
    const active = document.activeElement;
    return !active || active === document.body || active === start || (active.tagName === 'H2' && body.contains(active));
  };
  const place = () => {
    const h = heading();
    if (h && document.activeElement !== h && ours()) h.focus({ preventScroll: true });
  };
  place();
  const observer = new MutationObserver(place);
  observer.observe(body, { childList: true, subtree: true });
  const stop = () => {
    observer.disconnect();
    window.clearTimeout(timer);
    window.removeEventListener('keydown', stop, true);
    window.removeEventListener('pointerdown', stop, true);
  };
  const timer = window.setTimeout(stop, 3000);
  window.addEventListener('keydown', stop, true);
  window.addEventListener('pointerdown', stop, true);
}

/**
 * A link's `&part=` (`settingsHref(…, part)`): once that card is drawn with its loaded data (not
 * the skeleton copy, which is `inert`), scroll it to the top, move focus to its heading and ring it
 * for a moment. Waits up to 8 s for the data; gives up as soon as the person scrolls, taps or types
 * first, so the page never jumps under them.
 */
function landOnPart(body: HTMLElement, part: SettingsPartId): () => void {
  let unmark = 0;
  const find = () =>
    Array.from(body.querySelectorAll<HTMLElement>(`[data-settings-part="${part}"]`)).find((el) => !el.closest('[inert]'));
  const land = () => {
    const el = find();
    if (!el) return;
    stop();
    scrollToTopOf(el);
    el.querySelector<HTMLElement>('h2[tabindex]')?.focus({ preventScroll: true });
    el.setAttribute('data-landed', '');
    unmark = window.setTimeout(() => el.removeAttribute('data-landed'), 2400);
  };
  const observer = new MutationObserver(land);
  const timer = window.setTimeout(() => stop(), 8000);
  const cancel = () => stop();
  const events = ['keydown', 'pointerdown', 'wheel', 'touchmove'] as const;
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
    for (const e of events) window.removeEventListener(e, cancel, true);
  }
  observer.observe(body, { childList: true, subtree: true });
  for (const e of events) window.addEventListener(e, cancel, true);
  land();
  return () => {
    stop();
    window.clearTimeout(unmark);
  };
}

type Leave ={ to: SettingsSectionId | null } | { href: string } | { proceed: () => void };

/**
 * The one Settings screen (§7): a section per area. Desktop and tablet show the sections as a side
 * list beside the open one; a phone shows the list first, then the chosen section with a way back.
 * Leaving a section with unsaved edits — another section, a menu link, the language switch,
 * closing the tab — asks first. Only the sections the viewer may see are listed
 * (`SETTINGS_SECTION_ACCESS`); a `?section=` they can't see opens their first one instead.
 *
 * Switching section is client-side only: the list marks the new section in the same frame as the
 * click, and `?section=` follows with `history.replaceState` (Next keeps `useSearchParams` in step)
 * instead of `router.replace`, which re-rendered the server page on every switch for nothing.
 */
export function SettingsScreen({ initialSection }: { initialSection: SettingsSectionId | null }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useSession();
  const sections = useMemo(() => visibleSettingsSections(user?.permissions ?? []), [user]);
  // The address bar wins over the server's prop: coming back to an entry whose `?section=` was
  // replaced on the client restores the page the server drew for the older address.
  const [picked, setSection] = useState<SettingsSectionId | null>(
    () => parseSection(searchParams?.get('section') ?? undefined) ?? initialSection,
  );
  // The page's guard lets in only someone with a section, so `sections` is never empty there.
  const section = picked && sections.includes(picked) ? picked : null;
  const [dirtyBy, setDirtyBy] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState<Leave | null>(null);
  const dirty = Object.values(dirtyBy).some(Boolean);
  const shown: SettingsSectionId | undefined = section ?? sections[0];
  // Read once: switching section drops `&part=` from the address (`open`).
  const [part] = useState(() => parseSettingsPart(shown, searchParams?.get('part')));

  const report = useCallback((source: string, isDirty: boolean) => {
    setDirtyBy((prev) => (Boolean(prev[source]) === isDirty ? prev : { ...prev, [source]: isDirty }));
  }, []);
  const onLeaveAttempt = useCallback(
    (target: string | (() => void)) =>
      setLeaving(typeof target === 'string' ? { href: target } : { proceed: target }),
    [],
  );
  useLeaveGuard(dirty, onLeaveAttempt);

  // A new section starts from its top (owner, 2026-11-21): scrolled deep into Accounting, picking
  // Notifications in the sticky list shows Notifications' heading, not the old scroll position.
  // Its heading takes focus (no scroll of its own) so a screen reader announces where it landed.
  // On a phone, back to the list shows the list from its top.
  const navRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useRevealTopOnChange(section ? bodyRef : navRef, section ?? 'list', (el) => {
    if (section) focusFirstHeading(el);
  });
  useEffect(() => (part && bodyRef.current ? landOnPart(bodyRef.current, part) : undefined), [part]);

  function open(to: SettingsSectionId | null) {
    setSection(to);
    window.history.replaceState(null, '', to ? `${pathname}?section=${to}` : (pathname ?? ''));
  }

  function choose(to: SettingsSectionId | null) {
    if (to === section) return;
    if (dirty && (to ?? sections[0]) !== shown) setLeaving({ to });
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
        <nav ref={navRef} aria-label={t('settings.sectionsLabel')} className={cn('md:sticky md:top-6', section && 'max-md:hidden')}>
          <ul data-skeleton-block="settings-nav" className="flex flex-col gap-1 rounded-3xl bg-card p-2 shadow-card">
            {sections.map((id) => {
              const Icon = ICONS[id];
              const current = id === shown;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={current ? 'page' : undefined}
                    onClick={() => choose(id)}
                    className={cn(
                      'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-start text-sm font-semibold',
                      'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
                      current ? 'md:bg-primary-soft md:text-primary' : cn('text-foreground hover:bg-muted', TAB_HOVER_FADE),
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

        <div ref={bodyRef} className={cn('flex min-w-0 flex-col gap-4', !section && 'max-md:hidden')}>
          {section ? (
            <Button variant="ghost" size="sm" className="self-start md:hidden" onClick={() => choose(null)}>
              <ChevronStartIcon className="flip-rtl" />
              {t('settings.allSections')}
            </Button>
          ) : null}
          <DirtyReporterProvider value={report}>
            {shown ? <SectionBody key={shown} id={shown} /> : null}
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

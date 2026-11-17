'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useCan } from '@/core/auth/session-context';
import { ChevronDownIcon } from '@/shared/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { useGroupOpen } from './group-state';
import {
  isActive,
  moduleIsActive,
  NAV_MODULES,
  visibleModules,
  type NavItem,
  type NavModule,
} from './nav-items';

/*
 * The menu, grouped by module (docs/ARCHITECTURE.md → core/navigation).
 * - `full` (≥1280px sidebar and the phone drawer): Home's one page as a link, each live module a
 *   collapsible group (open by default and whenever one of its pages is current; the choice is
 *   remembered per group), coming modules locked with a "Soon" tag. Administration (Settings and
 *   Activity) is the last group; `footer` (the signed-in user) sits at the bottom.
 * - Only the pages the user may see (`can()`, view only — the API still refuses); a module with
 *   none left is not drawn.
 * - `rail` (768–1279px): one icon per module with its name as tooltip; a module with several pages
 *   opens them in a flyout beside the rail.
 */
export function SidebarNav({
  variant,
  onNavigate,
  footer,
}: {
  variant: 'full' | 'rail';
  onNavigate?: () => void;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const modules = useMemo(() => visibleModules(NAV_MODULES, can), [can]);
  const rail = variant === 'rail';

  return (
    <nav aria-label={t('ui.shell.mainNav')} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="scrollbar-clean -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <ul className={cn('flex flex-col gap-1.5', rail && 'items-center')}>
          {modules.map((module) => (
            <li key={module.key} className={cn(rail && 'w-auto')}>
              {rail ? <RailModule module={module} /> : <FullModule module={module} onNavigate={onNavigate} />}
            </li>
          ))}
        </ul>
      </div>
      {footer ? <div className={cn('flex flex-col gap-2.5', rail && 'items-center')}>{footer}</div> : null}
    </nav>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

const TONE_CLASSES: Record<NavModule['tone'], string> = {
  primary: 'bg-primary-soft text-primary',
  neutral: 'bg-secondary text-muted-foreground',
  accent: 'bg-accent-soft text-accent-foreground',
};

/** A module's coloured icon tile. */
function ModuleTile({ module }: { module: NavModule }) {
  const Icon = module.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-7.5 shrink-0 place-items-center rounded-[0.625rem]',
        TONE_CLASSES[module.tone],
        module.status === 'soon' && 'opacity-70 grayscale',
      )}
    >
      <Icon className="size-[1.15rem]" />
    </span>
  );
}

function useNavLocation() {
  const { locale } = useTranslation();
  const pathname = usePathname() ?? '';
  return { locale, pathname };
}

/** One page: icon, label and the sunflower dot when current. `iconOnly` for the rail. */
function PageLink({
  item,
  onNavigate,
  iconOnly = false,
  nested = false,
}: {
  item: NavItem;
  onNavigate?: () => void;
  iconOnly?: boolean;
  nested?: boolean;
}) {
  const { t } = useTranslation();
  const { locale, pathname } = useNavLocation();
  const active = isActive(item, pathname, locale);
  const label = t(`common.nav.${item.key}`);
  const Icon = item.icon;
  return (
    <Link
      href={`/${locale}${item.path}`}
      aria-current={active ? 'page' : undefined}
      title={iconOnly ? label : undefined}
      onClick={onNavigate}
      className={cn(
        'relative flex items-center gap-2.75 rounded-xl font-semibold transition-colors duration-150',
        nested ? 'min-h-9 px-2.5 py-1.5 text-[0.84rem]' : 'min-h-10 px-3 py-2 text-[0.875rem]',
        active ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        iconOnly && 'size-12 justify-center p-0',
        iconOnly && active && 'shadow-[inset_0_-3px_0_var(--accent)]',
      )}
    >
      <Icon className="size-5 shrink-0" />
      <span className={cn('min-w-0 flex-1 truncate', iconOnly && 'sr-only')}>{label}</span>
      {active && !iconOnly ? (
        <span aria-hidden="true" className="size-1.75 shrink-0 rounded-full bg-accent ring-4 ring-accent/30" />
      ) : null}
    </Link>
  );
}

/** A locked module: its name with a "Soon" tag. Not a link and not focusable. */
function SoonModule({ module, iconOnly = false }: { module: NavModule; iconOnly?: boolean }) {
  const { t } = useTranslation();
  const name = t(module.nameKey);
  if (iconOnly) {
    return (
      <span
        role="img"
        aria-label={t('common.nav.soonTitle', { name })}
        title={t('common.nav.soonTitle', { name })}
        className="relative grid size-12 cursor-not-allowed place-items-center"
      >
        <ModuleTile module={module} />
        <span aria-hidden="true" className="absolute end-1.5 top-1.5 size-1.75 rounded-full bg-accent/85" />
      </span>
    );
  }
  return (
    <div
      aria-disabled="true"
      className="flex min-h-11.5 cursor-not-allowed items-center gap-2.75 rounded-[0.875rem] px-2.5 py-2 text-[0.9rem] font-semibold text-muted-foreground"
    >
      <ModuleTile module={module} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 rounded-full bg-secondary px-1.75 py-px text-[0.66rem] font-bold whitespace-nowrap">
        {t('common.nav.soon')}
      </span>
    </div>
  );
}

function FullModule({ module, onNavigate }: { module: NavModule; onNavigate?: () => void }) {
  if (module.status === 'soon') return <SoonModule module={module} />;
  if (module.items.length === 1 && module.items[0]) return <SingleModule module={module} item={module.items[0]} onNavigate={onNavigate} />;
  return <ModuleGroup module={module} onNavigate={onNavigate} />;
}

/** A live module with one page (Home → Dashboard): that page's link with the module's tile. */
function SingleModule({ module, item, onNavigate }: { module: NavModule; item: NavItem; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { locale, pathname } = useNavLocation();
  const active = isActive(item, pathname, locale);
  return (
    <Link
      href={`/${locale}${item.path}`}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'flex min-h-11.5 items-center gap-2.75 rounded-[0.875rem] px-2.5 py-2 text-[0.9rem] font-bold transition-colors duration-150',
        active ? 'bg-primary-soft text-primary' : 'text-foreground hover:bg-muted',
      )}
    >
      <ModuleTile module={module} />
      <span className="min-w-0 flex-1 truncate">{t(`common.nav.${item.key}`)}</span>
      {active ? <span aria-hidden="true" className="size-1.75 shrink-0 rounded-full bg-accent ring-4 ring-accent/30" /> : null}
    </Link>
  );
}

/** A collapsible module: header button with the coloured tile, its pages indented below. */
function ModuleGroup({ module, onNavigate }: { module: NavModule; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { locale, pathname } = useNavLocation();
  const listId = useId();
  const [open, toggle] = useGroupOpen(module.key, pathname, moduleIsActive(module, pathname, locale));
  return (
    <div className={cn('rounded-2xl', open && 'bg-muted ring-1 ring-border ring-inset')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
        className="flex min-h-11.5 w-full cursor-pointer items-center gap-2.75 rounded-[0.875rem] px-2.5 py-2 text-start text-[0.9rem] font-bold text-foreground"
      >
        <ModuleTile module={module} />
        <span className="min-w-0 flex-1 truncate">{t(module.nameKey)}</span>
        <ChevronDownIcon
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-(--ease-snappy) motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? (
        <ul id={listId} className="ms-6 flex flex-col gap-0.5 border-s-2 border-border ps-2 pe-2.5 pb-2.5">
          {module.items.map((item) => (
            <li key={item.key}>
              <PageLink item={item} onNavigate={onNavigate} nested />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The rail: Home as a link, a multi-page module as a button opening its pages beside the rail. */
function RailModule({ module }: { module: NavModule }) {
  const { t } = useTranslation();
  const { locale, pathname } = useNavLocation();
  const [open, setOpen] = useState(false);
  const name = t(module.nameKey);
  const active = moduleIsActive(module, pathname, locale);
  const tileClass = cn(
    'grid size-12 cursor-pointer place-items-center rounded-xl transition-colors duration-150',
    active ? 'bg-primary-soft shadow-[inset_0_-3px_0_var(--accent)]' : 'hover:bg-muted',
  );

  if (module.status === 'soon') return <SoonModule module={module} iconOnly />;
  const only = module.items.length === 1 ? module.items[0] : undefined;
  if (only) {
    const label = t(`common.nav.${only.key}`);
    return (
      <Link href={`/${locale}${only.path}`} aria-current={active ? 'page' : undefined} title={label} className={tileClass}>
        <ModuleTile module={module} />
        <span className="sr-only">{label}</span>
      </Link>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={name} title={name} className={tileClass}>
          <ModuleTile module={module} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={locale === 'ar' ? 'left' : 'right'}
        align="start"
        sideOffset={10}
        aria-label={t('common.nav.modulePages', { name })}
        className="w-60 p-2"
      >
        <p className="px-3 pt-1.5 pb-2 font-display text-sm font-extrabold">{name}</p>
        <ul className="flex flex-col gap-0.5">
          {module.items.map((item) => (
            <li key={item.key}>
              <PageLink item={item} onNavigate={() => setOpen(false)} nested />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

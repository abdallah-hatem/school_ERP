'use client';

import { useState, type ReactNode } from 'react';
import { SchoolBrand } from '@/core/settings/school-brand';
import { useSchoolBranding } from '@/core/settings/branding-provider';
import { LocaleSwitch } from '@/shared/components/layout/locale-switch';
import { Button } from '@/shared/components/ui/button';
import { CloseIcon, MenuIcon } from '@/shared/components/ui/icons';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/shared/components/ui/sheet';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { SidebarNav } from './sidebar-nav';

/**
 * The signed-in frame.
 * - ≥1280px: sidebar with labels.
 * - 768–1279px: icon rail.
 * - <768px: top bar with the school name and a menu button opening a drawer from the start edge.
 *   Esc, the backdrop, ✕ or choosing a link closes it, and focus returns to the menu button.
 * `account` is the slot for the signed-in user's card (auth, T2).
 */
export function AppShell({ children, account }: { children: ReactNode; account?: ReactNode }) {
  const { t, locale } = useTranslation();
  const { branding } = useSchoolBranding();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const schoolName = locale === 'ar' ? branding.nameAr : branding.nameEn;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[5.25rem_minmax(0,1fr)] xl:grid-cols-[16.5rem_minmax(0,1fr)] print:block">
      {/* Sidebar / icon rail (never printed: a printout is the page's content only) */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col gap-7 border-e border-border bg-card px-3 py-6 md:flex xl:px-4.5">
        <SchoolBrand collapse="below-xl" className="max-xl:justify-center xl:px-1.5" />
        <div className="scrollbar-clean -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <SidebarNav variant="responsive" />
        </div>
        {account ? <div className="mt-auto">{account}</div> : null}
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Phone top bar */}
        <header className="no-print sticky top-0 z-40 flex items-center gap-2.5 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur md:hidden">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" size="icon" aria-label={t('ui.shell.openMenu')}>
                <MenuIcon className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="start" label={t('ui.shell.mainNav')} className="gap-6 px-4 py-5">
              <div className="flex items-center gap-2">
                <SchoolBrand className="flex-1" />
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" aria-label={t('ui.shell.closeMenu')}>
                    <CloseIcon className="size-5" />
                  </Button>
                </SheetClose>
              </div>
              <div className="scrollbar-clean -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
                <SidebarNav variant="drawer" onNavigate={() => setDrawerOpen(false)} />
              </div>
              {account ? <div>{account}</div> : null}
            </SheetContent>
          </Sheet>
          <p className="font-display min-w-0 flex-1 truncate text-base font-extrabold">{schoolName}</p>
          <LocaleSwitch />
        </header>

        {/* Tablet and desktop: language switch above the content */}
        <div className="no-print hidden items-center justify-end px-6 pt-5 md:flex xl:px-8">
          <LocaleSwitch />
        </div>

        <main id="main" className="@container flex min-w-0 flex-1 flex-col gap-6 px-4 pt-5 pb-8 md:px-6 md:pt-3 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

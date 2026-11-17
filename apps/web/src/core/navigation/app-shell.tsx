"use client";

import type { AuthUser } from "@school-erp/shared";
import { useState, type ReactNode } from "react";
import { SchoolBrand } from "@/core/settings/school-brand";
import { useSchoolBranding } from "@/core/settings/branding-provider";
import { LocaleSwitch } from "@/shared/components/layout/locale-switch";
import { Button } from "@/shared/components/ui/button";
import { CloseIcon, MenuIcon } from "@/shared/components/ui/icons";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { useTranslation } from "@/shared/providers/i18n-provider";
import { SidebarNav } from "./sidebar-nav";
import { UserChip } from "./user-chip";

/**
 * The signed-in frame.
 * - ≥1280px: sidebar grouped by module, Settings and the signed-in user at the bottom.
 * - 768–1279px: icon rail, one icon per module.
 * - <768px: top bar with the school name and a menu button opening a drawer from the start edge
 *   (the same grouped menu). Esc, the backdrop, ✕ or choosing a link closes it, and focus returns
 *   to the menu button.
 * `user` is the signed-in person, read by the layout on the server so the first paint shows them.
 */
export function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user?: AuthUser | null;
}) {
  const { t, locale } = useTranslation();
  const { branding } = useSchoolBranding();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const schoolName = locale === "ar" ? branding.nameAr : branding.nameEn;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[5.25rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)] print:block">
      {/*
        Sidebar / icon rail (never printed: a printout is the page's content only). The column
        carries the panel's colour and border, so it runs the page's full height however long the
        content is; the menu inside stays in view (sticky, one screen tall, scrolls on its own).
      */}
      <div
        data-testid="sidebar-column"
        className="no-print border-border bg-card hidden border-e md:block"
      >
        <aside className="scrollbar-clean sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto px-3 py-5.5 xl:px-3.5">
          <SchoolBrand
            collapse="below-xl"
            className="max-xl:justify-center xl:px-1.5"
          />
          <div className="hidden min-h-0 flex-1 flex-col xl:flex">
            <SidebarNav
              variant="full"
              footer={user ? <UserChip user={user} /> : null}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col xl:hidden">
            <SidebarNav
              variant="rail"
              footer={user ? <UserChip user={user} compact /> : null}
            />
          </div>
        </aside>
      </div>

      <div className="flex min-w-0 flex-col">
        {/* Phone top bar */}
        <header className="no-print border-border bg-background/90 sticky top-0 z-40 flex items-center gap-2.5 border-b px-4 py-2.5 backdrop-blur md:hidden">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                aria-label={t("ui.shell.openMenu")}
              >
                <MenuIcon className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="start"
              label={t("ui.shell.mainNav")}
              className="gap-6 px-4 py-5"
            >
              <div className="flex items-center gap-2">
                <SchoolBrand className="flex-1" />
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("ui.shell.closeMenu")}
                  >
                    <CloseIcon className="size-5" />
                  </Button>
                </SheetClose>
              </div>
              <SidebarNav
                variant="full"
                onNavigate={() => setDrawerOpen(false)}
                footer={user ? <UserChip user={user} /> : null}
              />
            </SheetContent>
          </Sheet>
          {/* Up to two lines: a long English name is cut only past the second line. */}
          <p className="font-display line-clamp-2 min-w-0 flex-1 text-sm leading-tight font-extrabold break-words min-[400px]:text-base">
            {schoolName}
          </p>
          <LocaleSwitch />
        </header>

        {/* Tablet and desktop: language switch above the content */}
        <div className="no-print hidden items-center justify-end px-6 pt-5 md:flex xl:px-8">
          <LocaleSwitch />
        </div>

        <main
          id="main"
          className="@container flex min-w-0 flex-1 flex-col gap-6 px-4 pt-5 pb-8 md:px-6 md:pt-3 xl:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

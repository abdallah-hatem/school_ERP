'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';

/*
 * Which menu groups the person left open or closed, kept in this browser (a convenience only:
 * private windows and blocked storage simply start with every group open).
 */

const STORAGE_KEY = 'nav.groups';
const CHANGE_EVENT = 'nav-groups-change';

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeGroup(key: string, open: boolean): void {
  try {
    const all = parse(readRaw());
    all[key] = open;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked or full: the choice lasts until the page changes.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * A group's open state: open by default and whenever one of its pages is current (`active`);
 * otherwise the person's remembered choice. Toggling applies at once on this page and is stored.
 */
export function useGroupOpen(key: string, pathname: string, active: boolean): [boolean, () => void] {
  // The server has no storage: it renders every group open, the remembered choice applies after.
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const stored = useMemo(() => parse(raw)[key], [raw, key]);
  // A toggle on this page wins over "current page opens its group" until the page changes.
  const [choice, setChoice] = useState<{ path: string; open: boolean } | null>(null);
  const open = choice?.path === pathname ? choice.open : active || (stored ?? true);
  const toggle = () => {
    setChoice({ path: pathname, open: !open });
    writeGroup(key, !open);
  };
  return [open, toggle];
}

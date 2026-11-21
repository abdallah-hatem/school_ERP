'use client';

import { useSyncExternalStore } from 'react';

/** Chrome's / Edge's install event (not in the DOM typings yet). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/*
 * The browser's own "Install app" offer, kept from the moment it fires (it fires once, early, and
 * only when the app is installable and not installed yet) until the person uses it from My account.
 * Never shown on its own: no banner, no nagging (owner, 2026-11-21).
 */

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Starts listening (once, from the service worker registrar in the root layout). */
export function captureInstallPrompt(target: Pick<Window, 'addEventListener'> = window): void {
  target.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  target.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

/** For tests: as if the browser had (or hadn't) offered to install. */
export function setInstallPromptForTest(event: BeforeInstallPromptEvent | null, isInstalled = false): void {
  deferred = event;
  installed = isInstalled;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** `available`: the browser offers to install now; `installed`: just installed from here. */
export function useInstallPrompt(): { available: boolean; installed: boolean; install: () => Promise<boolean> } {
  const state = useSyncExternalStore(
    subscribe,
    () => (deferred ? 'available' : installed ? 'installed' : 'none'),
    () => 'none',
  );
  return {
    available: state === 'available',
    installed: state === 'installed',
    async install() {
      const event = deferred;
      if (!event) return false;
      await event.prompt();
      const { outcome } = await event.userChoice;
      deferred = null;
      if (outcome === 'accepted') installed = true;
      emit();
      return outcome === 'accepted';
    },
  };
}

'use client';

import type { FormEvent } from 'react';
import { REMOVE_THIS_PUSH_DEVICE } from './apis';
import { currentSubscription } from './browser';

/** How long signing out waits for the device to be forgotten before it goes ahead anyway. */
const FORGET_TIMEOUT_MS = 2_000;

/**
 * Signing out turns this browser's alerts off first (owner, 2026-11-21): a shared staff-room
 * computer must not keep showing the last person's notifications. Best effort and short — signing
 * out never waits more than two seconds or fails because of it.
 */
export async function forgetThisDevice(): Promise<void> {
  const work = (async () => {
    const sub = await currentSubscription();
    if (!sub) return;
    await REMOVE_THIS_PUSH_DEVICE(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
  })().catch(() => undefined);
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, FORGET_TIMEOUT_MS))]);
}

/**
 * `onSubmit` for a sign-out form whose `action` is the sign-out server action: holds the submit
 * until this browser's alerts are off, then submits again for real (the action runs then).
 */
export function forgetDeviceThenSubmit(event: FormEvent<HTMLFormElement>): void {
  const form = event.currentTarget;
  if (form.dataset.deviceForgotten === 'yes' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  event.preventDefault();
  void forgetThisDevice().finally(() => {
    form.dataset.deviceForgotten = 'yes';
    form.requestSubmit();
  });
}

'use client';

import { useSyncExternalStore } from 'react';
import { Button } from '@/shared/components/ui/button';
import { CheckIcon, InstallAppIcon, ShareIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { browserEnv, isIos, isStandalone, type BrowserEnv } from '../browser';
import { useInstallPrompt } from '../install-prompt';

const noChanges = () => () => undefined;

/** What the install entry shows: the browser's offer, the iPhone steps, already installed, or nothing. */
export type InstallState = 'checking' | 'prompt' | 'ios' | 'installed' | 'none';

/**
 * Safari on iPhone / iPad has no install button: the person adds the app from the Share menu.
 * Three short steps, the Share glyph drawn as Safari draws it.
 */
export function IosInstallSteps() {
  const { t } = useTranslation();
  return (
    <ol data-testid="ios-install-steps" className="flex list-none flex-col gap-2 p-0 text-sm">
      {(['step1', 'step2', 'step3'] as const).map((step, i) => (
        <li key={step} className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-extrabold text-primary"
          >
            {i + 1}
          </span>
          <span className="flex items-center gap-1.5 pt-0.5">
            {t(`common.pwa.ios.${step}`)}
            {step === 'step1' ? <ShareIcon className="size-4 shrink-0 text-primary" /> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * My account → "Install app" (owner, 2026-11-21): an unobtrusive card, never a banner. Where the
 * browser offers to install (Chrome, Edge, Android), its button opens the browser's own dialog; on
 * an iPhone or iPad in Safari, the Add to Home Screen steps; once installed (or running as the
 * app), a quiet "Installed on this device". Browsers that can't install show nothing.
 *
 * `env` stands in for the browser in tests.
 */
export function InstallApp({ env }: { env?: BrowserEnv }) {
  const { t } = useTranslation();
  const prompt = useInstallPrompt();
  // Read on the client only: the server render (and the first paint) shows nothing.
  const base = useSyncExternalStore(
    noChanges,
    () => {
      const e = env ?? browserEnv();
      return isStandalone(e) ? 'installed' : isIos(e) ? 'ios' : 'none';
    },
    () => 'checking' as const,
  );

  const state: InstallState =
    base === 'installed' || prompt.installed ? 'installed' : prompt.available ? 'prompt' : base;
  if (state === 'none' || state === 'checking') return null;

  return (
    <section
      data-testid="install-app"
      data-state={state}
      className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-card md:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-lg text-primary"
        >
          {state === 'installed' ? <CheckIcon /> : <InstallAppIcon />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="font-display text-base font-extrabold">
            {state === 'installed' ? t('common.pwa.installed') : state === 'ios' ? t('common.pwa.ios.title') : t('common.pwa.install')}
          </h2>
          {state === 'installed' ? null : (
            <p className="text-sm text-muted-foreground">{t('common.pwa.installDescription')}</p>
          )}
        </div>
        {state === 'prompt' ? (
          <Button variant="soft" onClick={() => void prompt.install()} className="shrink-0">
            <InstallAppIcon />
            {t('common.pwa.install')}
          </Button>
        ) : null}
      </div>
      {state === 'ios' ? <IosInstallSteps /> : null}
    </section>
  );
}

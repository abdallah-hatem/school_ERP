import webPush from 'web-push';

/**
 * Turns push alerts on for one e2e suite: a VAPID pair made for this run only (never a committed
 * key), set before the app boots — call it at the top of the spec file. Jest gives each suite its
 * own `process.env`, so the other suites keep running without push.
 */
export function useTestVapidKeys(): { publicKey: string; privateKey: string } {
  const keys = webPush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:it@example.test';
  return keys;
}

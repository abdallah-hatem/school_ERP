/*
 * core/pwa (web) — the installable app and its push alerts (owner, 2026-11-21; §11 → Push,
 * docs/ARCHITECTURE.md → Installable app and push): the manifest and offline page builders, the
 * service worker registration, the install entry, "Alerts on this device" and My devices, and
 * forgetting this device on sign-out. The service worker itself is `public/sw.js`.
 */
export { ServiceWorkerRegistrar, SERVICE_WORKER_ENABLED } from './components/service-worker';
export { DeviceAlerts, type DeviceAlertsState } from './components/device-alerts';
export { InstallApp, IosInstallSteps } from './components/install-app';
export { forgetDeviceThenSubmit, forgetThisDevice } from './sign-out';
export { manifestFor, manifestPath, type WebAppManifest } from './manifest';
export { offlineHtml, offlinePath } from './offline-page';
export { GET_PUSH_DEVICES } from './apis';

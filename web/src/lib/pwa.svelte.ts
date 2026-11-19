import { registerSW } from 'virtual:pwa-register';

/**
 * Offline support. A new version waits until you choose to load it, so an update never reloads the
 * app in the middle of a set.
 */
class AppUpdates {
  ready = $state(false);
  private apply: ((reload?: boolean) => Promise<void>) | undefined;

  start() {
    if (!('serviceWorker' in navigator)) return;
    this.apply = registerSW({
      onNeedRefresh: () => { this.ready = true; },
      onRegisteredSW: (_url, registration) => {
        if (!registration) return;
        // Home Screen apps can stay open for days; look for a new version whenever the app comes back.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        });
      },
    });
  }

  update() { this.apply?.(true); }
  later() { this.ready = false; }
}

export const updates = new AppUpdates();

import { registerSW } from 'virtual:pwa-register';

/** How long "Later" keeps the update banner away. */
export const SNOOZE_MS = 30 * 60_000;

/**
 * Offline support. A new version waits until you choose to load it, so an update never reloads the
 * app in the middle of a set.
 */
class AppUpdates {
  ready = $state(false);
  private apply: ((reload?: boolean) => Promise<void>) | undefined;
  private snoozedUntil = 0;

  start() {
    if (!('serviceWorker' in navigator)) return;
    this.apply = registerSW({
      onNeedRefresh: () => { this.ready = true; },
      onRegisteredSW: (_url, registration) => {
        if (!registration) return;
        // Home Screen apps can stay open for days; look for a new version whenever the app comes back.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') this.cameBack(registration);
        });
      },
    });
  }

  /**
   * The app came back to the foreground. A version that's already waiting doesn't announce itself
   * again, so after "Later" the banner would never return; offer it again once the snooze is over.
   */
  cameBack(registration: Pick<ServiceWorkerRegistration, 'waiting' | 'update'>, now = Date.now()) {
    if (registration.waiting && now >= this.snoozedUntil) this.ready = true;
    registration.update().catch(() => {});
  }

  update() { this.apply?.(true); }
  later(now = Date.now()) { this.ready = false; this.snoozedUntil = now + SNOOZE_MS; }
}

export const updates = new AppUpdates();

import { requestPersistence } from './db';

/**
 * Running from the Home Screen rather than in a Safari tab. Data in a tab is a separate copy that
 * Safari can clear after 7 days without a visit; the Home Screen app's isn't.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
    || (navigator as { standalone?: boolean }).standalone === true;
}

/** Whether the browser agreed not to clear Forge's data under storage pressure. */
class StorageGuard {
  /** null until asked. */
  persisted = $state<boolean | null>(null);
  installed = $state(isStandalone());

  /** Reads the current answer without asking for anything. */
  async check(): Promise<boolean> {
    try { this.persisted = (await navigator.storage?.persisted?.()) ?? false; } catch { this.persisted = false; }
    return this.persisted;
  }

  /** Asks for persistent storage (once granted, there's nothing more to ask). */
  async request(): Promise<boolean> {
    if (this.persisted) return true;
    this.persisted = await requestPersistence();
    return this.persisted;
  }

  /** Data that won't be cleared: a Home Screen app with persistent storage. */
  get safe(): boolean { return this.installed && this.persisted === true; }
}

export const storageGuard = new StorageGuard();

const BANNER_KEY = 'forge.safariBannerHidden';

/** The "you're in a Safari tab" banner: hidden for the rest of this visit once dismissed, back next time. */
class SafariBanner {
  hidden = $state(read());
  dismiss() {
    this.hidden = true;
    try { sessionStorage.setItem(BANNER_KEY, '1'); } catch { /* private mode: hidden until reload */ }
  }
}

function read(): boolean {
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(BANNER_KEY) === '1'; } catch { return false; }
}

export const safariBanner = new SafariBanner();

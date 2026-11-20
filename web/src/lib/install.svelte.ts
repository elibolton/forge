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

export type OS = 'ios' | 'android' | 'other';
export type Browser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'other';
export type Device = { os: OS; browser: Browser };

/** The phone's OS and browser, from the user agent. iPads that ask for desktop sites report as Macs with touch. */
export function detectDevice(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  touchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints ?? 0): Device {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) {
    const browser: Browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : 'safari';
    return { os: 'ios', browser };
  }
  if (/Android/.test(ua)) {
    const browser: Browser = /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'firefox' : /EdgA/.test(ua) ? 'edge' : /Chrome/.test(ua) ? 'chrome' : 'other';
    return { os: 'android', browser };
  }
  return { os: 'other', browser: 'other' };
}

export const device = detectDevice();

export const browserName: Record<Browser, string> = {
  safari: 'Safari', chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge', samsung: 'Samsung Internet', other: 'your browser',
};

/**
 * On iPhone the Home Screen app keeps its own, separate copy of the data, and Safari can clear a tab's
 * data after 7 days without a visit. On Android the installed app shares the browser's data.
 */
export const separateAppData = device.os === 'ios';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/**
 * The browser's own install prompt (Chrome, Edge and Samsung Internet on Android, and desktop Chrome).
 * Caught as soon as the browser offers it, so an Install button can show it later.
 */
class InstallPrompt {
  available = $state(false);
  private event: InstallEvent | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.event = e as InstallEvent; this.available = true; });
    addEventListener('appinstalled', () => { this.event = null; this.available = false; });
  }

  /** Shows the install prompt. True if the person installed. */
  async show(): Promise<boolean> {
    const e = this.event;
    if (!e) return false;
    this.event = null;
    this.available = false;
    await e.prompt();
    return (await e.userChoice).outcome === 'accepted';
  }
}

export const installPrompt = new InstallPrompt();

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

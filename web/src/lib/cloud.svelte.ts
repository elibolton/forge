// Account and sync state for the app. Signing in is optional: signed out, nothing here runs and the
// app works on this device only, as before. Signed in, changes sync shortly after they're saved, when
// the app opens or comes back to the front, when the network returns, and every few minutes.

import { db, onLocalChange } from './db';
import { type Account, Server, ServerError, type Session } from './server';
import { type Cursors, syncPass } from './syncEngine';

const SESSION_KEY = 'forge.session';
const CURSORS_KEY = 'forge.cursors';
const LAST_ACCOUNT_KEY = 'forge.lastAccount';
const PUSH_DELAY = 2000;
const INTERVAL = 5 * 60 * 1000;
const REFRESH_AFTER = 24 * 60 * 60 * 1000;

export type SyncStatus = 'signedOut' | 'syncing' | 'synced' | 'offline' | 'expired' | 'error';

function read<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function write(key: string, value: unknown) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

class Cloud {
  session = $state.raw<Session | null>(read<Session>(SESSION_KEY));
  status = $state<SyncStatus>(read<Session>(SESSION_KEY) ? 'synced' : 'signedOut');
  /** Changes on this device not yet on the server. */
  pending = $state(0);
  lastSyncedAt = $state<number | null>(null);
  error = $state<string | null>(null);

  account = $derived<Account | null>(this.session?.account ?? null);

  private server = new Server();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private again = false;
  /** Called after a pass brings in changes, so the app can re-read its data. */
  private onPulled: () => Promise<void> | void = () => {};
  private started = false;

  /** Wires up triggers once the app has loaded. `onPulled` re-reads data after changes arrive. */
  start(onPulled: () => Promise<void> | void) {
    this.onPulled = onPulled;
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    onLocalChange(() => this.soon());
    addEventListener('online', () => this.soon(0));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.soon(0); });
    setInterval(() => { if (document.visibilityState === 'visible') this.soon(0); }, INTERVAL);
    this.soon(0);
  }

  /** Schedules a sync; repeated calls within the delay collapse into one. */
  soon(delay = PUSH_DELAY) {
    void this.countPending();
    if (!this.session) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.now(), delay);
  }

  /** Syncs now. If a pass is already running, one more runs after it. */
  now(): Promise<void> {
    if (!this.session) return Promise.resolve();
    if (this.running) { this.again = true; return this.running; }
    this.running = this.pass().finally(() => {
      this.running = null;
      if (this.again) { this.again = false; void this.now(); }
    });
    return this.running;
  }

  private async pass() {
    const s = this.session;
    if (!s) return;
    this.status = 'syncing';
    try {
      const current = Date.now() - s.refreshedAt > REFRESH_AFTER ? await this.refresh(s) : s;
      const cursorsKey = `${CURSORS_KEY}.${current.account.id}`;
      const result = await syncPass(this.server, current, read<Cursors>(cursorsKey) ?? {});
      write(cursorsKey, result.cursors);
      if (result.pulled) await this.onPulled();
      this.lastSyncedAt = Date.now();
      this.error = null;
      this.status = 'synced';
    } catch (e) {
      const err = e instanceof ServerError ? e : new ServerError(String(e), -1);
      this.error = err.message;
      this.status = err.offline ? 'offline' : err.unauthorized ? 'expired' : 'error';
      // The server asked to slow down (a big first upload): carry on shortly.
      if (err.status === 429) { this.status = 'syncing'; this.soon(15000); }
      if (!(e instanceof ServerError)) console.error('Sync failed', e);
    }
    await this.countPending();
  }

  private async refresh(s: Session): Promise<Session> {
    const next = await this.server.refresh(s);
    this.setSession(next);
    return next;
  }

  private async countPending() {
    try { this.pending = await db.outboxCount(); } catch { /* storage unavailable */ }
  }

  private setSession(s: Session | null) {
    this.session = s;
    write(SESSION_KEY, s);
  }

  // MARK: Signing in

  /** Step 1: emails a sign-in code. A new email gets an account with it. Returns the code's id. */
  async sendCode(email: string): Promise<string> {
    return this.server.requestCode(email.trim().toLowerCase());
  }

  /**
   * Step 2: checks the emailed code. Returns the session without signing in yet, so the screen can
   * ask before mixing this phone's data from another account into this one.
   */
  async checkCode(otpId: string, code: string): Promise<{ session: Session; otherAccountData: boolean }> {
    let session: Session;
    try {
      session = await this.server.verifyCode(otpId, code.replace(/\D/g, ''));
    } catch (e) {
      if (e instanceof ServerError && e.status === 400) {
        throw new ServerError("That code didn't work. Check it, or ask for a new one.", 400);
      }
      throw e;
    }
    const last = read<string>(LAST_ACCOUNT_KEY);
    const hasData = (await db.allLogs()).length > 0;
    return { session, otherAccountData: !!last && last !== session.account.id && hasData };
  }

  /** Step 3: signs in. This phone's data is queued so anything the server doesn't have uploads. */
  async signIn(session: Session) {
    await db.queueEverything();
    this.setSession(session);
    write(LAST_ACCOUNT_KEY, session.account.id);
    this.status = 'syncing';
    await this.now();
  }

  /** Signs out. Data stays on this phone. */
  signOut() {
    clearTimeout(this.timer);
    this.setSession(null);
    this.status = 'signedOut';
    this.error = null;
    this.lastSyncedAt = null;
  }

  /** Deletes the account and everything on the server. Data on this phone stays. */
  async deleteAccount() {
    const s = this.session;
    if (!s) return;
    await this.server.deleteAccount(s);
    write(`${CURSORS_KEY}.${s.account.id}`, null);
    write(LAST_ACCOUNT_KEY, null);
    this.signOut();
  }
}

export const cloud = new Cloud();

/** One line for the sync status, for the Account screen and the You tab. */
export function syncLabel(): string {
  switch (cloud.status) {
    case 'signedOut': return 'Off';
    case 'syncing': return 'Syncing…';
    case 'offline': return cloud.pending ? `Offline, ${cloud.pending} waiting` : 'Offline';
    case 'expired': return 'Sign in again';
    case 'error': return "Couldn't sync";
    case 'synced': {
      if (cloud.pending) return `${cloud.pending} waiting`;
      if (!cloud.lastSyncedAt) return 'On';
      const mins = Math.floor((Date.now() - cloud.lastSyncedAt) / 60000);
      return mins < 1 ? 'Synced just now' : mins < 60 ? `Synced ${mins} min ago` : 'Synced';
    }
  }
}

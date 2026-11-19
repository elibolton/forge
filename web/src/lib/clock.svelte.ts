// The current day, for screens that show "today". `Date.now()` inside a `$derived` isn't reactive, so a
// Home Screen app left open overnight would keep showing yesterday; reading `clock.today` instead makes
// them update at midnight and whenever the app comes back to the foreground.

export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

class Clock {
  /** Midnight at the start of today (local time). Changes only when the day does. */
  today = $state(startOfDay(Date.now()));
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.refresh(); });
    this.arm();
  }

  /** Re-reads the date; screens update only if the day changed. */
  refresh(now = Date.now()) {
    const day = startOfDay(now);
    if (day !== this.today) this.today = day;
  }

  /** Wakes just after the next midnight. Timers pause while the phone sleeps, so this re-checks each minute too. */
  private arm() {
    clearTimeout(this.timer);
    const next = new Date(this.today); next.setDate(next.getDate() + 1);
    const wait = Math.min(60_000, Math.max(1_000, next.getTime() - Date.now() + 1_000));
    this.timer = setTimeout(() => { this.refresh(); this.arm(); }, wait);
  }
}

export const clock = new Clock();

/** `Date.now()`, re-read whenever the day changes. Use inside `$derived` / templates. */
export function currentTime(): number { void clock.today; return Date.now(); }

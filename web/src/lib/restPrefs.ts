import type { SessionState } from './session.svelte';

/** Rest lengths offered in the logger, in seconds. */
export const REST_CHOICES = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300] as const;

/**
 * Gives each exercise in a workout your remembered rest for it, if you set one (mutates `state`).
 * Exercises with no rest at all (warm-up and cool-down stretches) keep none.
 */
export function applyRestPreferences(state: SessionState, prefs: Record<string, number> | undefined) {
  if (!prefs) return;
  for (const e of state.exercises) {
    const p = prefs[e.exerciseID];
    if (p !== undefined && e.restSeconds > 0) e.restSeconds = p;
  }
}

/** "1:30", "2 min", "45 s": how a rest length reads on a button. */
export function restLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

/** The spoken form: "1 minute 30 seconds". */
export function restSpoken(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  const parts = [m ? `${m} minute${m === 1 ? '' : 's'}` : '', s ? `${s} second${s === 1 ? '' : 's'}` : ''].filter(Boolean);
  return parts.join(' ') || '0 seconds';
}

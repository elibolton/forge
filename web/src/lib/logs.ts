import { focusTitle } from './labels';
import { type WorkoutLog, app, logVolume } from './store.svelte';
import { toasts } from './toasts.svelte';
import type { WeightUnits } from './units';

export function logSummary(log: WorkoutLog, units: WeightUnits): string {
  const count = log.exercises.length;
  const volume = logVolume(log);
  return [
    count === 1 ? '1 exercise' : `${count} exercises`,
    // Imported workouts have no duration.
    log.durationSeconds > 0 ? `${Math.max(1, Math.floor(log.durationSeconds / 60))} min` : null,
    volume > 0 ? `${units.format(volume)} moved` : null,
  ].filter(Boolean).join(' · ');
}

export const logTitle = (log: WorkoutLog) => (log.focus ? `${focusTitle[log.focus]} Day` : 'Workout');

/** Deletes with an Undo banner that restores the identical workout. */
export function deleteLog(log: WorkoutLog) {
  app.deleteLog(log.id);
  toasts.show('Workout deleted', () => app.addLog(log));
}

export const fmtDate = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString(undefined, o);

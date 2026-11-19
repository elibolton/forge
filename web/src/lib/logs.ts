import { dayTitle } from './labels';
import { type WorkoutLog, app, logVolume } from './store.svelte';
import { toasts } from './toasts.svelte';
import { type WeightUnits, durationText } from './units';

export function logSummary(log: WorkoutLog, units: WeightUnits): string {
  const count = log.exercises.length;
  const volume = logVolume(log);
  return [
    count === 1 ? '1 exercise' : `${count} exercises`,
    // Imported workouts have no duration.
    log.durationSeconds > 0 ? durationText(log.durationSeconds) : null,
    volume > 0 ? `${units.format(volume)} moved` : null,
  ].filter(Boolean).join(' · ');
}

/** The same name Today and the logger used: a saved workout's name, a program day, or the day's focus. */
export const logTitle = (log: WorkoutLog) => log.title ?? (log.focus ? dayTitle(log.focus) : 'Workout');

/** Deletes with an Undo banner that restores the identical workout. */
export function deleteLog(log: WorkoutLog) {
  app.deleteLog(log.id);
  toasts.show('Workout deleted', () => app.addLog(log));
}

export const fmtDate = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString(undefined, o);

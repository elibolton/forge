// How a logged workout's date, length and size read on History and the workout page.
import { Programs, workingSets } from '../engine';
import { dayTitle } from './labels';
import type { WorkoutLog } from './store.svelte';
import { durationText } from './units';

/**
 * Whether the workout's time of day is real. Imported workouts carry only a date, stored as midnight
 * with no duration; showing "12:00 AM" for them reads as a bug.
 */
export function hasTimeOfDay(log: Pick<WorkoutLog, 'date' | 'durationSeconds'>): boolean {
  const d = new Date(log.date);
  const midnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
  return !(midnight && log.durationSeconds === 0);
}

/** "Thu, Nov 19 · 11:48 PM", or "Thu, Nov 19, 2025" when the time isn't known. The year shows when it isn't this year's. */
export function logDateText(log: Pick<WorkoutLog, 'date' | 'durationSeconds'>, now = Date.now()): string {
  const d = new Date(log.date);
  const otherYear = d.getFullYear() !== new Date(now).getFullYear();
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(otherYear ? { year: 'numeric' } : {}) });
  return hasTimeOfDay(log) ? `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : day;
}

/** Working sets done (warm-ups and empty sets left out). */
export const logSetCount = (log: WorkoutLog) => log.exercises.reduce((t, e) => t + workingSets(e).filter((s) => s.reps > 0).length, 0);

/** Today's "Trained today" line: "Pull Day · 3 min · 6 sets", or "Week 2 · Pull Day · …" for a program day. */
export function trainedDetail(log: WorkoutLog): string {
  const ref = log.program;
  const day = ref ? Programs.byID(ref.programID)?.days.find((d) => d.id === ref.dayID) : undefined;
  const name = ref && day ? `Week ${ref.week} · ${day.title} Day` : log.focus ? dayTitle(log.focus) : log.title;
  return [name, logStats(log)].filter(Boolean).join(' · ');
}

/** "42 min · 18 sets", or just the sets for an imported workout with no duration. */
export function logStats(log: WorkoutLog): string {
  const sets = logSetCount(log);
  return [log.durationSeconds > 0 ? durationText(log.durationSeconds) : null, `${sets} ${sets === 1 ? 'set' : 'sets'}`].filter(Boolean).join(' · ');
}

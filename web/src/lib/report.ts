import { type LoggedExercise, workingSets } from '../engine';
import { weekStart } from './weeks';

interface Log { date: number; durationSeconds: number; exercises: LoggedExercise[] }

export interface PeriodStats { workouts: number; minutes: number; sets: number; volume: number }

export function statsBetween(logs: Log[], from: number, to: number): PeriodStats {
  const s: PeriodStats = { workouts: 0, minutes: 0, sets: 0, volume: 0 };
  for (const l of logs) {
    if (l.date < from || l.date >= to) continue;
    s.workouts++;
    s.minutes += Math.round(l.durationSeconds / 60);
    for (const e of l.exercises) for (const set of workingSets(e)) { s.sets++; s.volume += set.weight * set.reps; }
  }
  return s;
}

export type Period = 'week' | 'month';

/** This week (or month) so far, and the whole of the one before. */
export function periodReport(logs: Log[], period: Period, now = Date.now()) {
  let start: number, prevStart: number;
  if (period === 'week') {
    start = weekStart(now);
    prevStart = weekStart(start - 3 * 86_400_000);
  } else {
    const d = new Date(now);
    start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  }
  return { current: statsBetween(logs, start, Infinity), previous: statsBetween(logs, prevStart, start) };
}

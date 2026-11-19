// Turning a finished workout into what gets saved: pure functions, so the rules (what counts as
// logged, what's a personal record) are testable without the app around them.

import { Catalog, type Exercise, type LoggedExercise, effortRIR, oneRM, workingSets } from '../engine';
import type { SessionState } from './session.svelte';
import type { WorkoutLog } from './store.svelte';

export interface PersonalRecord { exercise: Exercise; oneRM: number; previous: number }

/**
 * The sets that were done, per exercise. Exercises with nothing done are left out. Working sets carry
 * their own RIR, or the exercise's if only that was rated; warm-ups and lowering-only work have none.
 */
export function loggedExercises(state: SessionState): LoggedExercise[] {
  const logged: LoggedExercise[] = [];
  for (const ex of state.exercises) {
    const eccentric = ex.program?.effort.type === 'eccentricOnly';
    const sets = ex.sets.filter((s) => s.done).map((s) => ({
      weight: s.weight ?? 0, reps: s.reps, rir: s.isWarmup || eccentric ? null : (s.rir ?? ex.rir), isWarmup: s.isWarmup, side: s.side ?? null,
    }));
    if (!sets.length) continue;
    logged.push({
      exerciseID: ex.exerciseID, sets, targetReps: ex.targetReps, slotID: ex.program?.slotID ?? null,
      repRange: ex.program?.range ?? null, targetRIR: ex.program ? effortRIR(ex.program.effort)?.low ?? null : null,
    });
  }
  return logged;
}

/** The workout to save, or null when nothing was done. It ends at `endedAt`. */
export function workoutLog(state: SessionState, id: string, endedAt: number): WorkoutLog | null {
  const exercises = loggedExercises(state);
  if (!exercises.length) return null;
  return {
    id, date: state.startedAt, focus: state.focus, exercises, program: state.program ?? null,
    durationSeconds: Math.round((Math.max(endedAt, state.startedAt) - state.startedAt) / 1000),
  };
}

/**
 * Exercises whose best estimated 1RM today beats `bestOneRM` (kg, per exercise id) by more than 0.5%.
 * The first time you do an exercise isn't a record.
 */
export function newRecords(exercises: LoggedExercise[], bestOneRM: ReadonlyMap<string, number>): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  for (const ex of exercises) {
    const values = workingSets(ex).filter((s) => s.weight > 0).map((s) => oneRM(s.weight, s.reps, s.rir));
    const top = values.length ? Math.max(...values) : 0;
    const previous = bestOneRM.get(ex.exerciseID);
    if (previous !== undefined && top > previous * 1.005) records.push({ exercise: Catalog.exercise(ex.exerciseID), oneRM: top, previous });
  }
  return records;
}

/** A program day counts as done once it has at least one working set. */
export const completesProgramDay = (log: WorkoutLog | null): boolean =>
  !!log?.program && log.exercises.some((l) => workingSets(l).length > 0);

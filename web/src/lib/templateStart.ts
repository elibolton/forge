import { Catalog, type Planner, plannedWorkingSets } from '../engine';
import { type SessionState, newSet, sessionExerciseFrom } from './session.svelte';
import { type WorkoutTemplate, templateFromLogged } from './templates';
import type { WorkoutLog } from './store.svelte';
import { normalizeGroups } from './groups';

/**
 * A workout ready to log from a template. Sets and reps come from the template; loads come from your
 * history the same way a generated workout's do, with warm-ups for heavy lifts.
 */
export function sessionFromTemplate(t: WorkoutTemplate, planner: Planner, from = `From “${t.name}”`): SessionState {
  // An exercise that no longer exists (a custom one deleted before deleting checked saved workouts)
  // would start as a nameless placeholder that logs under a dead id; leave it out. So is a 0-set item.
  const exercises = t.exercises.filter((item) => item.sets > 0 && Catalog.byID.has(item.exerciseID)).map((item) => {
    const e = Catalog.exercise(item.exerciseID);
    const planned = planner.prescribe(e);
    const weight = plannedWorkingSets(planned)[0]?.weight ?? null;
    const x = sessionExerciseFrom(planned);
    x.sets = [
      ...(weight !== null ? planner.warmupSets(weight, item.reps, e).map((w) => newSet(w.weight, w.reps, { isWarmup: true })) : []),
      ...Array.from({ length: item.sets }, () => newSet(weight, item.reps)),
    ];
    x.targetReps = item.reps;
    if (item.group) x.supersetGroup = item.group; else delete x.supersetGroup;
    x.reasons = [from, ...agreeingReasons(planned.reasons, item.reps)];
    return x;
  });
  const state: SessionState = { startedAt: Date.now(), focus: null, exercises, currentIndex: 0, title: t.name };
  normalizeGroups(state); // a template edited by hand might hold a group of one
  return state;
}

/**
 * The planner's advice, minus any line naming a rep target other than the reps the sets are prefilled
 * with: "aim for 7 reps" over sets of 6 contradicts itself, and people follow the big number. The
 * planner prescribes its own reps while a saved workout keeps its own; only the text is reconciled here.
 */
export function agreeingReasons(reasons: string[], reps: number): string[] {
  return reasons.filter((r) => {
    const named = /aim for (\d+)|build to (\d+) reps/i.exec(r);
    return !named || Number(named[1] ?? named[2]) === reps;
  });
}

/** Starts a past workout again: the same exercises, sets and reps, with weights from your latest numbers. */
export function sessionFromLog(log: WorkoutLog, title: string, planner: Planner): SessionState {
  const day = new Date(log.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return sessionFromTemplate(templateFromLogged(title, log.exercises), planner, `Repeating your ${day} workout`);
}

import { Catalog, type Planner, plannedWorkingSets } from '../engine';
import { type SessionState, newSet, sessionExerciseFrom } from './session.svelte';
import type { WorkoutTemplate } from './templates';
import { normalizeGroups } from './groups';

/**
 * A workout ready to log from a template. Sets and reps come from the template; loads come from your
 * history the same way a generated workout's do, with warm-ups for heavy lifts.
 */
export function sessionFromTemplate(t: WorkoutTemplate, planner: Planner): SessionState {
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
    x.reasons = [`From “${t.name}”`, ...planned.reasons];
    return x;
  });
  const state: SessionState = { startedAt: Date.now(), focus: null, exercises, currentIndex: 0, title: t.name };
  normalizeGroups(state); // a template edited by hand might hold a group of one
  return state;
}


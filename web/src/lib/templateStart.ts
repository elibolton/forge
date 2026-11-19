import { Catalog, type Planner, plannedWorkingSets } from '../engine';
import { type SessionState, newSet, sessionExerciseFrom } from './session.svelte';
import type { WorkoutTemplate } from './templates';

/**
 * A workout ready to log from a template. Sets and reps come from the template; loads come from your
 * history the same way a generated workout's do, with warm-ups for heavy lifts.
 */
export function sessionFromTemplate(t: WorkoutTemplate, planner: Planner): SessionState {
  const exercises = t.exercises.map((item) => {
    const e = Catalog.exercise(item.exerciseID);
    const planned = planner.prescribe(e);
    const weight = plannedWorkingSets(planned)[0]?.weight ?? null;
    const x = sessionExerciseFrom(planned);
    x.sets = [
      ...(weight !== null ? planner.warmupSets(weight, item.reps, e).map((w) => newSet(w.weight, w.reps, { isWarmup: true })) : []),
      ...Array.from({ length: item.sets }, () => newSet(weight, item.reps)),
    ];
    x.targetReps = item.reps;
    x.reasons = [`From “${t.name}”`, ...planned.reasons];
    return x;
  });
  return { startedAt: Date.now(), focus: null, exercises, currentIndex: 0, title: t.name };
}


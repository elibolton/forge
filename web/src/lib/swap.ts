import { type Exercise, type Planner, isBodyweight, plannedWorkingSets, uuid } from '../engine';
import { type SessionExercise, type SessionState, newSet, sessionExerciseFrom } from './session.svelte';

/**
 * Swaps exercise `id` for `replacement` in a workout in progress (mutates `state`).
 *
 * Sets already logged stay with the original exercise, so history stays true; the sets still to do
 * move to the replacement, inserted right after it. Nothing logged yet: the replacement takes its place.
 * Program details (rep range, RIR, rest, superset) carry over to the replacement.
 */
export function swapInSession(state: SessionState, id: string, replacement: Exercise, planner: Planner) {
  const i = state.exercises.findIndex((x) => x.id === id);
  if (i < 0) return;
  const old = state.exercises[i];
  const done = old.sets.filter((s) => s.done);
  const pending = old.sets.filter((s) => !s.done && !s.isWarmup);
  const planned = planner.prescribe(replacement);
  const first = plannedWorkingSets(planned)[0];
  const weight = isBodyweight(replacement) ? null : (first?.weight ?? null);

  let next: SessionExercise;
  if (old.program) {
    const reps = pending[0]?.reps ?? old.targetReps ?? first?.reps ?? 10;
    const sets = done.length || weight === null
      ? []
      : planner.warmupSets(weight, reps, replacement).map((w) => newSet(w.weight, w.reps, { isWarmup: true }));
    const working = pending.length ? pending : old.sets.filter((s) => !s.isWarmup);
    for (const s of working) sets.push(newSet(weight, s.reps, { side: s.side ?? null }));
    next = { ...old, id: uuid(), exerciseID: replacement.id, sets, rir: null, reasons: [`Swapped in for ${old.exerciseID}`] };
  } else {
    next = sessionExerciseFrom(planned);
    if (done.length && pending.length) {
      // Keep the number of sets that were left, at the new exercise's prescription.
      const working = next.sets.filter((s) => !s.isWarmup);
      next.sets = pending.map((_, k) => ({ ...(working[k] ?? working[working.length - 1]), id: uuid() }));
    }
  }

  if (!done.length) {
    state.exercises[i] = next;
  } else if (pending.length) {
    old.sets = done;
    state.exercises.splice(i + 1, 0, next);
    state.currentIndex = i + 1;
  }
}

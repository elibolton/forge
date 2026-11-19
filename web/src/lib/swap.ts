import { type Exercise, type Planner, isBodyweight, plannedWorkingSets, uuid } from '../engine';
import { type SessionExercise, type SessionState, newSet, sessionExerciseFrom } from './session.svelte';
import { groupOf, setGroup } from './groups';

/**
 * Swaps exercise `id` for `replacement` in a workout in progress (mutates `state`).
 *
 * Sets already logged stay with the original exercise, so history stays true; the sets still to do
 * move to the replacement, inserted right after it (all of them, if every set was done). Nothing logged
 * yet: the replacement takes its place. Returns whether anything changed.
 * Program details (rep range, RIR, rest, superset) carry over to the replacement.
 */
export function swapInSession(state: SessionState, id: string, replacement: Exercise, planner: Planner): boolean {
  const i = state.exercises.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const old = state.exercises[i];
  // Only working sets count as logged: with just warm-ups ticked, the replacement takes its place outright
  // (with its own warm-ups) rather than leaving a warm-up-only exercise behind.
  const done = old.sets.filter((s) => s.done && !s.isWarmup);
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
    // Its own copy of the program details, so regrouping one doesn't regroup the other.
    next = { ...old, program: structuredClone(old.program), id: uuid(), exerciseID: replacement.id, sets, rir: null, reasons: [`Swapped in for ${old.exerciseID}`] };
  } else {
    next = sessionExerciseFrom(planned);
    // Stay in the same superset, with the same rest, as the exercise it replaces.
    if (old.supersetGroup) { next.supersetGroup = old.supersetGroup; next.restSeconds = old.restSeconds; }
    if (done.length && pending.length) {
      // Keep the number of sets that were left, at the new exercise's prescription.
      const working = next.sets.filter((s) => !s.isWarmup);
      next.sets = pending.map((_, k) => ({ ...(working[k] ?? working[working.length - 1]), id: uuid() }));
    }
  }

  if (!done.length) {
    state.exercises[i] = next;
  } else {
    // Sets already logged stay with the original. With nothing left to do on it, the replacement comes
    // after it with a full set of sets.
    if (pending.length) old.sets = old.sets.filter((s) => s.done);
    const group = groupOf(old);
    if (group !== undefined) {
      // The original is finished with: it leaves its superset, moving to just before it, and the
      // replacement takes its place in the rotation, so a pair stays a pair rather than becoming a tri-set.
      const first = state.exercises.findIndex((x) => groupOf(x) === group);
      setGroup(old, undefined);
      state.exercises[i] = next;
      state.exercises.splice(first, 0, old);
    } else state.exercises.splice(i + 1, 0, next);
    state.currentIndex = i + 1;
  }
  return true;
}

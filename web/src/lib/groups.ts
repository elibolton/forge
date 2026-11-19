// Supersets, tri-sets and circuits: exercises done in rotation, one set of each per round, with a
// short rest between them and the full rest after the round.
//
// A group is a run of exercises next to each other in the workout that share a group id. Two make a
// superset, three a tri-set, four or more a circuit. Groups come from the workout generator (pairs),
// program days (pairs), saved workouts, or the user linking exercises in the logger.

import { SUPERSET_REST_BETWEEN } from '../engine';
import type { SessionExercise, SessionState } from './session.svelte';

/** The group an exercise belongs to, whichever way it was made. */
export const groupOf = (e: SessionExercise): string | undefined => e.supersetGroup ?? e.program?.supersetGroup;

/** Puts an exercise in a group, or takes it out with `undefined`; program days keep theirs in step. */
export function setGroup(e: SessionExercise, id: string | undefined) {
  if (id === undefined && groupOf(e) !== undefined) {
    // Rest on its own again: a group's first exercise only had the short between-rest.
    e.restSeconds = Math.max(e.restSeconds, 60);
  }
  if (id === undefined) delete e.supersetGroup; else e.supersetGroup = id;
  if (e.program) e.program.supersetGroup = id;
}

export type GroupKind = 'superset' | 'triset' | 'circuit';
export const groupKind = (size: number): GroupKind => (size <= 2 ? 'superset' : size === 3 ? 'triset' : 'circuit');
export const groupLabel = (size: number) => ({ superset: 'Superset', triset: 'Tri-set', circuit: 'Circuit' })[groupKind(size)];

/** Positions of a group's exercises, in workout order. */
export function members(state: SessionState, group: string): number[] {
  return state.exercises.flatMap((x, i) => (groupOf(x) === group ? [i] : []));
}

const hasSetsLeft = (e: SessionExercise) => e.sets.some((s) => !s.isWarmup && !s.done);

/**
 * Where to go after logging a set of exercise `index` in a group: the next exercise in the rotation
 * that still has sets to do. `endOfRound` is true when the rotation wraps back to the start (or there's
 * nowhere left to go), which is when the full rest comes.
 */
export function nextInRound(state: SessionState, index: number): { next?: number; endOfRound: boolean } {
  const group = groupOf(state.exercises[index]);
  if (!group) return { endOfRound: true };
  const m = members(state, group);
  const at = m.indexOf(index);
  const later = m.slice(at + 1).find((i) => hasSetsLeft(state.exercises[i]));
  if (later !== undefined) return { next: later, endOfRound: false };
  const earlier = m.slice(0, at).find((i) => hasSetsLeft(state.exercises[i]));
  return { next: earlier, endOfRound: true };
}

/**
 * Rest after a set in a group. Between exercises: the program's between-rest for the group, else
 * 30 seconds. After a round: the longest rest of the group's exercises.
 */
export function groupRest(state: SessionState, index: number, endOfRound: boolean): number {
  const group = groupOf(state.exercises[index]);
  const m = group ? members(state, group).map((i) => state.exercises[i]) : [state.exercises[index]];
  if (endOfRound) return Math.max(...m.map((x) => x.restSeconds));
  return m[0].program?.supersetRestBetween ?? SUPERSET_REST_BETWEEN;
}

/**
 * Keeps every group a run of neighbours with at least two exercises. After a move, a group split in two
 * keeps its id for the first run and the second gets a new one; an exercise left on its own leaves
 * the group.
 */
export function normalizeGroups(state: SessionState) {
  const seen = new Set<string>();
  let i = 0;
  while (i < state.exercises.length) {
    const g = groupOf(state.exercises[i]);
    if (!g) { i++; continue; }
    let end = i;
    while (end + 1 < state.exercises.length && groupOf(state.exercises[end + 1]) === g) end++;
    const run = state.exercises.slice(i, end + 1);
    if (run.length < 2) setGroup(run[0], undefined);
    else if (seen.has(g)) { const id = newGroupID(state); for (const x of run) setGroup(x, id); }
    seen.add(g);
    i = end + 1;
  }
}

/** A group id not used in this workout: A, B, C… */
export function newGroupID(state: SessionState): string {
  const used = new Set(state.exercises.map(groupOf));
  for (let n = 0; ; n++) {
    const id = n < 26 ? String.fromCharCode(65 + n) : `G${n}`;
    if (!used.has(id)) return id;
  }
}

/** Joins exercise `index` and the one after it (and their groups) into one group. */
export function linkWithNext(state: SessionState, index: number) {
  const a = state.exercises[index], b = state.exercises[index + 1];
  if (!a || !b) return;
  const id = groupOf(a) ?? groupOf(b) ?? newGroupID(state);
  const old = groupOf(b);
  for (const x of state.exercises) if (x === b || (old !== undefined && groupOf(x) === old)) setGroup(x, id);
  setGroup(a, id);
  normalizeGroups(state);
}

/** Splits the group between exercise `index` and the one after it. */
export function unlinkFromNext(state: SessionState, index: number) {
  const a = state.exercises[index], b = state.exercises[index + 1];
  const g = a && groupOf(a);
  if (!g || !b || groupOf(b) !== g) return;
  const id = newGroupID(state);
  for (let j = index + 1; j < state.exercises.length && groupOf(state.exercises[j]) === g; j++) setGroup(state.exercises[j], id);
  normalizeGroups(state);
}

/** Whether exercise `index` is grouped with the one after it. */
export function linkedToNext(state: SessionState, index: number): boolean {
  const a = state.exercises[index], b = state.exercises[index + 1];
  return !!a && !!b && groupOf(a) !== undefined && groupOf(a) === groupOf(b);
}

import { CUSTOM_PREFIX, type Exercise, type Joint, type MovementPattern, uuid } from '../engine';
import { app } from './store.svelte';
import { toasts } from './toasts.svelte';
import type { TodayPlan } from './plans';

export const MOVEMENTS: [MovementPattern, string][] = [
  ['isolation', 'Isolation (one joint)'], ['horizontalPush', 'Press forward'], ['verticalPush', 'Press overhead'],
  ['horizontalPull', 'Row'], ['verticalPull', 'Pull-down / pull-up'], ['squat', 'Squat'], ['hinge', 'Hinge'],
  ['lunge', 'Lunge / single leg'], ['core', 'Core'], ['carry', 'Carry'], ['mobility', 'Stretch / warm-up'],
];

export function makeCustomID(name: string): string {
  const slug = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return `${CUSTOM_PREFIX}${slug}-${uuid().replace(/-/g, '').slice(0, 6)}`;
}

/** So injury settings still apply to custom exercises. */
export function likelyJoints(p: MovementPattern): Joint[] {
  switch (p) {
    case 'squat': case 'lunge': return ['knee'];
    case 'hinge': return ['lowerBack', 'hip'];
    case 'verticalPush': return ['shoulder'];
    case 'horizontalPush': return ['shoulder', 'elbow'];
    default: return [];
  }
}

/**
 * Deletes an unused custom exercise (with Undo). One that appears in history is hidden from
 * recommendations instead, so past workouts keep its name.
 */
export function removeCustomExercise(e: Exercise) {
  const uses = app.derivedHistory.sessions.get(e.id)?.length ?? 0;
  if (uses > 0) {
    const previous = app.profile?.plan.preferences[e.id];
    app.updatePlan((p) => { p.preferences[e.id] = 'exclude'; });
    toasts.show(`Used in ${uses} workout${uses === 1 ? '' : 's'}, so it's hidden instead`, () =>
      app.updatePlan((p) => { if (previous) p.preferences[e.id] = previous; else delete p.preferences[e.id]; }));
    return;
  }
  const before = structuredClone(app.profile!);
  const todayBefore = app.get<TodayPlan>('todayPlan');
  app.updateProfile((p) => {
    p.customExercises = p.customExercises.filter((x) => x.id !== e.id);
    delete p.plan.preferences[e.id];
  });
  // Don't leave it in today's saved workout.
  if (todayBefore) {
    const today = structuredClone(todayBefore);
    today.workout.exercises = today.workout.exercises.filter((p) => p.exercise.id !== e.id);
    app.set('todayPlan', today);
  }
  toasts.show(`Deleted ${e.name}`, () => {
    app.setProfile(before);
    if (todayBefore) app.set('todayPlan', todayBefore);
  });
}

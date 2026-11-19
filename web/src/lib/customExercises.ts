import { CUSTOM_PREFIX, type Exercise, type Joint, type MovementPattern, uuid } from '../engine';
import { app } from './store.svelte';
import { toasts } from './toasts.svelte';
import type { ProgramDayEdits, TodayPlan } from './plans';
import { session } from './session.svelte';

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
 * Where a custom exercise is still used: logged workouts, the workout in progress, saved workouts and
 * this week's program-day swaps. Any of these needs its definition, or it turns into a nameless
 * placeholder with no muscles that counts as bodyweight.
 */
export function customExerciseUses(id: string): { logs: number; session: boolean; templates: number; programSwap: boolean } {
  return {
    logs: app.derivedHistory.sessions.get(id)?.length ?? 0,
    session: !!session.state?.exercises.some((x) => x.exerciseID === id),
    templates: app.templates.filter((t) => t.exercises.some((x) => x.exerciseID === id)).length,
    programSwap: Object.values(app.get<ProgramDayEdits>('programDayEdits')?.swaps ?? {}).includes(id),
  };
}

function inUseMessage(u: ReturnType<typeof customExerciseUses>): string | null {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (u.session) return 'In your workout in progress';
  if (u.logs) return `Used in ${plural(u.logs, 'workout')}`;
  if (u.templates) return `In ${plural(u.templates, 'saved workout')}`;
  if (u.programSwap) return "In this week's program";
  return null;
}

/**
 * Deletes an unused custom exercise (with Undo). One that's still used anywhere (see
 * `customExerciseUses`) is hidden from recommendations instead, so it keeps its name and muscles.
 */
export function removeCustomExercise(e: Exercise) {
  const inUse = inUseMessage(customExerciseUses(e.id));
  if (inUse) {
    const previous = app.profile?.plan.preferences[e.id];
    app.updatePlan((p) => { p.preferences[e.id] = 'exclude'; });
    toasts.show(`${inUse}, so it's hidden instead`, () =>
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

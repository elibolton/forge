import { type LoggedExercise, type PlannedExercise, plannedWorkingSets, uuid, workingSets } from '../engine';
import type { SessionExercise } from './session.svelte';
import { groupOf } from './groups';

/** A workout you saved to do again: which exercises, how many sets, and the reps you aim for. */
export interface WorkoutTemplate {
  id: string;
  name: string;
  /** `group` joins neighbouring exercises into a superset, tri-set or circuit. */
  exercises: { exerciseID: string; sets: number; reps: number; group?: string }[];
  createdAt: number;
  lastUsed?: number;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

function make(name: string, exercises: WorkoutTemplate['exercises']): WorkoutTemplate {
  return { id: uuid(), name: name.trim() || 'My workout', exercises: exercises.filter((e) => e.sets > 0), createdAt: Date.now() };
}

export const templateFromLogged = (name: string, logged: LoggedExercise[]) =>
  make(name, logged.map((l) => ({ exerciseID: l.exerciseID, sets: workingSets(l).length, reps: median(workingSets(l).map((s) => s.reps)) || 10 })));

export const templateFromPlanned = (name: string, planned: PlannedExercise[]) =>
  make(name, planned.map((p) => ({
    exerciseID: p.exercise.id, sets: plannedWorkingSets(p).length, reps: plannedWorkingSets(p)[0]?.reps ?? 10,
    ...(p.supersetGroup ? { group: p.supersetGroup } : {}),
  })));

export const templateFromSession = (name: string, exercises: SessionExercise[]) =>
  make(name, exercises.map((x) => {
    const working = x.sets.filter((s) => !s.isWarmup);
    const group = groupOf(x);
    return { exerciseID: x.exerciseID, sets: working.length, reps: median(working.map((s) => s.reps)) || 10, ...(group ? { group } : {}) };
  }));

export function readTemplate(v: unknown): WorkoutTemplate | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !Array.isArray(o.exercises)) return undefined;
  const exercises = o.exercises.flatMap((x) => {
    const e = x as Record<string, unknown>;
    return typeof e?.exerciseID === 'string' && typeof e.sets === 'number' && typeof e.reps === 'number'
      ? [{
        exerciseID: e.exerciseID, sets: Math.max(1, Math.round(e.sets)), reps: Math.max(1, Math.round(e.reps)),
        ...(typeof e.group === 'string' && e.group ? { group: e.group } : {}),
      }] : [];
  });
  if (!exercises.length) return undefined;
  return {
    id: o.id, name: typeof o.name === 'string' && o.name.trim() ? o.name : 'My workout', exercises,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
    lastUsed: typeof o.lastUsed === 'number' ? o.lastUsed : undefined,
  };
}

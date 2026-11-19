// Stored data must keep loading after app updates. These readers fill defaults for missing fields, skip values
// they no longer understand, and drop single bad items instead of failing a whole list.

import { placeholderName } from './catalog';
import {
  type DayFocus, type Exercise, type Gym, type LoggedExercise, type LoggedSet, type RecoveryOverride, type RepRange,
  type UserPlan, type WorkoutRecord, DAY_FOCUSES, EQUIPMENT, GOALS, JOINTS, LEVELS, MUSCLES, PATTERNS, PREFERENCES,
  SPLITS, VARIABILITIES, defaultPlan, uuid,
} from './models';
import type { ProgramRef } from './models';
import type { FatigueCheckIn, ProgramProgress } from './program';

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const oneOf = <T extends string>(all: readonly T[], v: unknown, fallback: T): T =>
  (all as readonly unknown[]).includes(v) ? (v as T) : fallback;
/** String-backed enum values, ignoring any this version doesn't know. */
const known = <T extends string>(all: readonly T[], v: unknown): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => (all as readonly unknown[]).includes(x)))] : [];

/** Decodes a list, skipping elements that fail instead of failing the whole list. */
export function lossy<T>(v: unknown, read: (x: unknown) => T | undefined): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    try { const r = read(x); if (r !== undefined) out.push(r); } catch { /* skip */ }
  }
  return out;
}

export function readPlan(v: unknown): UserPlan {
  const d = defaultPlan();
  if (!isObj(v)) return d;
  const prefs: UserPlan['preferences'] = {};
  if (isObj(v.preferences)) {
    for (const [k, p] of Object.entries(v.preferences)) if ((PREFERENCES as readonly unknown[]).includes(p)) prefs[k] = p as never;
  }
  return {
    goal: oneOf(GOALS, v.goal, d.goal),
    experience: oneOf(LEVELS, v.experience, d.experience),
    split: oneOf(SPLITS, v.split, d.split),
    sessionMinutes: num(v.sessionMinutes, d.sessionMinutes),
    variability: oneOf(VARIABILITIES, v.variability, d.variability),
    warmUpSets: bool(v.warmUpSets, d.warmUpSets),
    supersets: bool(v.supersets, d.supersets),
    preferences: prefs,
    injuries: known(JOINTS, v.injuries),
  };
}

export function readGym(v: unknown): Gym | undefined {
  if (!isObj(v)) return undefined;
  const increments: Gym['increments'] = {};
  if (isObj(v.increments)) {
    for (const [k, n] of Object.entries(v.increments)) {
      if ((EQUIPMENT as readonly string[]).includes(k) && typeof n === 'number' && n > 0) (increments as Record<string, number>)[k] = n;
    }
  }
  return {
    id: str(v.id, uuid()), name: str(v.name, 'Gym'), equipment: known(EQUIPMENT, v.equipment),
    usesPounds: bool(v.usesPounds, false), increments,
  };
}

export function readSet(v: unknown): LoggedSet | undefined {
  if (!isObj(v)) return undefined;
  return {
    weight: num(v.weight, 0), reps: Math.trunc(num(v.reps, 0)), rir: optNum(v.rir), isWarmup: bool(v.isWarmup, false),
    side: v.side === 'left' || v.side === 'right' ? v.side : null,
  };
}

function readRange(v: unknown): RepRange | null {
  return isObj(v) && typeof v.lower === 'number' && typeof v.upper === 'number' ? { lower: v.lower, upper: Math.max(v.lower, v.upper) } : null;
}

export function readLogged(v: unknown): LoggedExercise | undefined {
  if (!isObj(v) || typeof v.exerciseID !== 'string') return undefined; // meaningless without it
  return {
    exerciseID: v.exerciseID, sets: lossy(v.sets, readSet), targetReps: optNum(v.targetReps),
    slotID: typeof v.slotID === 'string' ? v.slotID : null, repRange: readRange(v.repRange), targetRIR: optNum(v.targetRIR),
  };
}

export function readProgramRef(v: unknown): ProgramRef | null {
  if (!isObj(v) || typeof v.programID !== 'string' || typeof v.dayID !== 'string') return null;
  return { programID: v.programID, week: num(v.week, 1), dayID: v.dayID, isDeload: bool(v.isDeload, false) };
}

export function readRecord(v: unknown): WorkoutRecord | undefined {
  if (!isObj(v) || typeof v.date !== 'number') return undefined;
  return {
    date: v.date, focus: (DAY_FOCUSES as readonly unknown[]).includes(v.focus) ? (v.focus as DayFocus) : null,
    exercises: lossy(v.exercises, readLogged), program: readProgramRef(v.program),
  };
}

export function readOverride(v: unknown): RecoveryOverride | undefined {
  if (!isObj(v) || !(MUSCLES as readonly unknown[]).includes(v.muscle)) return undefined;
  return { muscle: v.muscle as never, recovery: num(v.recovery, 1), date: num(v.date, 0) };
}

export function readExercise(v: unknown): Exercise | undefined {
  if (!isObj(v) || typeof v.id !== 'string') return undefined;
  return {
    id: v.id, name: str(v.name, placeholderName(v.id)), primary: known(MUSCLES, v.primary), secondary: known(MUSCLES, v.secondary),
    equipment: known(EQUIPMENT, v.equipment), pattern: oneOf(PATTERNS, v.pattern, 'isolation'),
    isCompound: bool(v.isCompound, false), level: oneOf(LEVELS, v.level, 'beginner'), starterOneRM: num(v.starterOneRM, 0),
    jointsStressed: known(JOINTS, v.jointsStressed), isTimed: bool(v.isTimed, false),
    notes: typeof v.notes === 'string' ? v.notes : undefined,
  };
}

function readCheckIn(v: unknown): FatigueCheckIn {
  const o = isObj(v) ? v : {};
  return {
    jointPain: bool(o.jointPain, false), stillSore: bool(o.stillSore, false),
    poorSleepOrMotivation: bool(o.poorSleepOrMotivation, false), repsDropped: bool(o.repsDropped, false),
  };
}

function weekMap<T>(v: unknown, read: (x: unknown) => T | undefined): Record<number, T> {
  const out: Record<number, T> = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) { const r = read(x); if (r !== undefined && !Number.isNaN(+k)) out[+k] = r; }
  return out;
}

const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : undefined);
const numberMap = (v: unknown) => {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) if (typeof n === 'number') out[k] = n;
  return out;
};

export function readProgress(v: unknown): ProgramProgress | null {
  if (!isObj(v) || typeof v.programID !== 'string') return null;
  return {
    programID: v.programID, startedAt: num(v.startedAt, Date.now()), week: Math.max(1, num(v.week, 1)),
    completed: weekMap(v.completed, strings), skipped: weekMap(v.skipped, strings), deloadNext: bool(v.deloadNext, false),
    setAdjustments: numberMap(v.setAdjustments), rangeExtensions: numberMap(v.rangeExtensions),
    checkIns: weekMap(v.checkIns, readCheckIn), isFinished: bool(v.isFinished, false),
  };
}

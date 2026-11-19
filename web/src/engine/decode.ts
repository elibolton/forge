// Stored data must keep loading after app updates. These readers fill defaults for missing fields, skip values
// they no longer understand, and drop single bad items instead of failing a whole list.

import { placeholderName } from './catalog';
import {
  type DayFocus, type Exercise, type MovementPattern, type Muscle, type Gym, type LoggedExercise, type LoggedSet, type RecoveryOverride, type RepRange,
  type UserPlan, type WorkoutRecord, type Equipment, DAY_FOCUSES, EQUIPMENT, LOAD_KINDS, NEEDS, GOALS, JOINTS, LEVELS, MUSCLES, PATTERNS, PREFERENCES,
  SPLITS, VARIABILITIES, defaultPlan, uuid,
} from './models';
import type { ProgramRef } from './models';
import type { FatigueCheckIn, ProgramProgress } from './program';
import { type BlockCheckIn, type BlockCheckIns, LOADING_WEEKS, MAX_LOADING_WEEKS } from './block';

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

/** The equipment list before it was split into specific pieces (bench, cable, ...). */
const OLD_EQUIPMENT = [
  'barbell', 'ezBar', 'trapBar', 'dumbbell', 'kettlebell', 'bench', 'squatRack', 'pullUpBar', 'dipStation', 'cable', 'latPulldown',
  'legPress', 'legCurl', 'legExtension', 'chestPressMachine', 'shoulderPressMachine', 'smithMachine', 'resistanceBand',
];
const ATTACHMENTS: Equipment[] = ['rope', 'straightBar', 'singleHandle', 'vBar', 'ankleStrap'];

/**
 * Converts an older gym's broad list: "bench" becomes both benches, "cable" a single adjustable column
 * with every attachment, and a dip station with dumbbells keeps weighted dips (now a dip belt). A gym
 * that had everything becomes a full gym. Anything else is kept, and the gym is flagged for a review.
 */
function upgradeEquipment(raw: unknown[]): { equipment: Equipment[]; review: boolean } {
  const old = new Set(raw.filter((x): x is string => typeof x === 'string'));
  if (OLD_EQUIPMENT.every((e) => old.has(e))) return { equipment: [...EQUIPMENT], review: false };
  const out = new Set<Equipment>(known(EQUIPMENT, [...old]));
  if (old.has('bench')) { out.add('flatBench'); out.add('adjustableBench'); }
  if (old.has('cable')) { out.add('cableColumn'); for (const a of ATTACHMENTS) out.add(a); }
  if (old.has('dipStation') && old.has('dumbbell')) out.add('dipBelt');
  return { equipment: EQUIPMENT.filter((e) => out.has(e)), review: old.size > 0 };
}

/** Weight steps above this are corrupt or a typo (they'd round every suggestion to the starting weight). */
const MAX_INCREMENT = 50;

/**
 * A stored gym. One saved without an id gets `fallbackID` (stable, e.g. from its place in the list) so it
 * keeps the same id from one read to the next; with none given it gets a random one.
 */
export function readGym(v: unknown, fallbackID?: string): Gym | undefined {
  if (!isObj(v)) return undefined;
  const increments: Gym['increments'] = {};
  if (isObj(v.increments)) {
    for (const [k, n] of Object.entries(v.increments)) {
      if ((LOAD_KINDS as readonly string[]).includes(k) && typeof n === 'number' && n > 0 && n <= MAX_INCREMENT) (increments as Record<string, number>)[k] = n;
    }
  }
  const raw = Array.isArray(v.equipment) ? v.equipment : [];
  // Lists saved before version 2 used the broad names.
  const upgraded = num(v.equipmentVersion, 1) < 2 ? upgradeEquipment(raw) : { equipment: known(EQUIPMENT, raw), review: false };
  const review = upgraded.review || bool(v.reviewEquipment, false);
  return {
    id: str(v.id, fallbackID ?? uuid()), name: str(v.name, 'Gym'), equipment: upgraded.equipment, equipmentVersion: 2,
    usesPounds: bool(v.usesPounds, false), increments, ...(review ? { reviewEquipment: true } : {}),
  };
}

export function readSet(v: unknown): LoggedSet | undefined {
  if (!isObj(v)) return undefined;
  return {
    // Never negative: a negative weight or rep count would only lower volume totals.
    weight: Math.max(0, num(v.weight, 0)), reps: Math.max(0, Math.trunc(num(v.reps, 0))), rir: optNum(v.rir), isWarmup: bool(v.isWarmup, false),
    side: v.side === 'left' || v.side === 'right' ? v.side : null,
    ...(v.type === 'drop' || v.type === 'failure' ? { type: v.type } : {}),
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

/** Before Forge split the shoulders into three heads, they were one muscle called "shoulders". */
const DELTS: Muscle[] = ['frontDelts', 'sideDelts', 'rearDelts'];

export function readOverride(v: unknown): RecoveryOverride | undefined {
  if (!isObj(v) || !(MUSCLES as readonly unknown[]).includes(v.muscle)) return undefined;
  return { muscle: v.muscle as never, recovery: num(v.recovery, 1), date: num(v.date, 0) };
}

/** Recovery overrides; an old "shoulders" override applies to all three heads. */
export function readOverrides(v: unknown): RecoveryOverride[] {
  return lossy(v, (x) => {
    if (isObj(x) && x.muscle === 'shoulders') return DELTS.map((m) => readOverride({ ...x, muscle: m })!);
    const one = readOverride(x);
    return one ? [one] : undefined;
  }).flat();
}

/** Muscle lists, mapping an old "shoulders" to the head the movement mostly trains. */
function readMuscles(v: unknown, pattern: MovementPattern, secondary: boolean): Muscle[] {
  if (!Array.isArray(v)) return [];
  const head: Muscle = secondary || pattern === 'verticalPush' || pattern === 'horizontalPush' ? 'frontDelts'
    : pattern === 'horizontalPull' || pattern === 'verticalPull' ? 'rearDelts' : 'sideDelts';
  return known(MUSCLES, v.flatMap((m) => (m === 'shoulders' ? [head] : [m])));
}

export function readExercise(v: unknown): Exercise | undefined {
  if (!isObj(v) || typeof v.id !== 'string') return undefined;
  const pattern = oneOf(PATTERNS, v.pattern, 'isolation');
  return {
    id: v.id, name: str(v.name, placeholderName(v.id)),
    primary: readMuscles(v.primary, pattern, false), secondary: readMuscles(v.secondary, pattern, true),
    // Custom exercises saved with the broad "cable" ask for an adjustable pulley.
    equipment: known(NEEDS, Array.isArray(v.equipment) ? v.equipment.map((x) => (x === 'cable' ? 'cableAdjustable' : x)) : []), pattern,
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

/**
 * End-of-block check-in answers (block start → week → answers). A block start that isn't a number, a
 * week outside 5–7, or an answer with no answer time is dropped, so a damaged entry only means that
 * block keeps its default plan.
 */
export function readBlockCheckIns(v: unknown): BlockCheckIns {
  const out: BlockCheckIns = {};
  if (!isObj(v)) return out;
  for (const [start, weeks] of Object.entries(v)) {
    if (start.trim() === '' || !Number.isFinite(+start) || !isObj(weeks)) continue;
    const block: Record<number, BlockCheckIn> = {};
    for (const [w, a] of Object.entries(weeks)) {
      const week = +w;
      if (!Number.isInteger(week) || week < LOADING_WEEKS || week > MAX_LOADING_WEEKS) continue;
      if (!isObj(a) || typeof a.answeredAt !== 'number' || !Number.isFinite(a.answeredAt)) continue;
      block[week] = {
        jointPain: bool(a.jointPain, false), stillSore: bool(a.stillSore, false),
        poorSleepOrMotivation: bool(a.poorSleepOrMotivation, false), stalled: bool(a.stalled, false),
        answeredAt: a.answeredAt, ...(a.skipped === true ? { skipped: true } : {}),
      };
    }
    if (Object.keys(block).length) out[String(+start)] = block;
  }
  return out;
}

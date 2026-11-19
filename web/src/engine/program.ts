// Structured multi-week programs. A program is static data shipped with the app (see `programs.ts`);
// only the user's place in it (`ProgramProgress`) is stored.

import { Catalog } from './catalog';
import { type DayFocus, type Exercise, type RepRange, repRangeText } from './models';

/** Reps in reserve as a range, e.g. 1–2. A single value has `low === high`. */
export interface RIRTarget { low: number; high: number }
export const rirTarget = (low: number, high?: number): RIRTarget => ({ low, high: Math.max(low, high ?? low) });
export const rirText = (t: RIRTarget) => (t.low === t.high ? `${t.low}` : `${t.low}–${t.high}`);

export type Effort =
  | { type: 'rir'; rir: RIRTarget }
  /** Lowering-only reps with no RIR (Nordic curls): end the set when the descent can't be controlled. */
  | { type: 'eccentricOnly' };

export const effortRIR = (e: Effort): RIRTarget | undefined => (e.type === 'rir' ? e.rir : undefined);
export const isEccentric = (e: Effort) => e.type === 'eccentricOnly';

export type Laterality = 'bilateral' | 'perArm' | 'perLeg';
export const isPerSide = (l: Laterality) => l !== 'bilateral';

/** How load goes up once every set reaches the top of the range. */
export type LoadStep = 'lowerBodyBarbell' | 'upperBarbell' | 'dumbbell' | 'cablePin' | 'bodyweight';

/** Which column of the week table sets this exercise's RIR. */
export type ExerciseClass = 'compound' | 'isolation';

export interface PrescriptionOverride { sets?: number; reps?: RepRange; effort?: Effort; note?: string }

export interface ExercisePrescription {
  /** Stable slot id within the program, e.g. "push.1" or "upper.6a". */
  id: string;
  exerciseID: string;
  /** Shown before the name, e.g. "6a". */
  label?: string;
  sets: number;
  reps: RepRange;
  /** Base effort; the week table overrides it by class. */
  effort: Effort;
  kind: ExerciseClass;
  /** Seconds between sets (or between rounds for per-side work). */
  rest: [number, number];
  /** Seconds between the two sides of a per-side set; undefined = go straight to the other side. */
  sideRest?: number;
  laterality: Laterality;
  loadStep: LoadStep;
  isOptional: boolean;
  supersetGroup?: string;
  /** Setup and technique cues. */
  notes: string[];
  /** Applies to the last working set only, e.g. "Lengthened partials". */
  lastSetNote?: string;
  /** Week number → changes for that week only. */
  weekOverrides: Record<number, PrescriptionOverride>;
}

export interface SupersetSpec {
  group: string;
  /** Rest between the paired exercises. */
  restBetween: [number, number];
  /** Rest after each pair. */
  restAfter: number;
}

export interface ProgramDay {
  id: string;
  title: string;
  focus: DayFocus;
  exercises: ExercisePrescription[];
  supersets: SupersetSpec[];
}

/** A day id, or null for rest. */
export type ScheduleSlot = string | null;

export type SetRule = 'normal' | 'halved';

export function applySetRule(rule: SetRule, sets: number): number {
  if (rule === 'normal') return sets;
  return sets === 4 ? 2 : Math.max(1, Math.ceil(sets / 2));
}

/** One row of the block table. */
export interface WeekRule {
  week: number;
  /** Undefined = keep each exercise's own base RIR. */
  compoundRIR?: RIRTarget;
  isolationRIR?: RIRTarget;
  /** Per-exercise RIR that beats the class column (e.g. squat/RDL 1–2 in weeks 5–7). */
  rirExceptions: Record<string, RIRTarget>;
  sets: SetRule;
  /** Last-set note for every isolation this week. */
  isolationLastSetNote?: string;
  /** Week 1: take the last set of one isolation per session to true failure. */
  calibrate: boolean;
  /** Deload: no failure and no last-set notes. */
  isDeload: boolean;
  notes: string[];
}

export function weekRule(week: number, o: Partial<WeekRule> = {}): WeekRule {
  return { week, rirExceptions: {}, sets: 'normal', calibrate: false, isDeload: false, notes: [], ...o };
}

export interface WorkoutProgram {
  id: string;
  name: string;
  summary: string;
  weeks: number;
  /** Monday first, 7 slots. */
  schedule: ScheduleSlot[];
  days: ProgramDay[];
  weekRules: WeekRule[];
  progressionNotes: string[];
}

export const programDay = (p: WorkoutProgram, id: string) => p.days.find((d) => d.id === id);

/** Training days in schedule order. */
export const dayOrder = (p: WorkoutProgram): string[] => p.schedule.filter((s): s is string => s !== null);

export const ruleFor = (p: WorkoutProgram, week: number): WeekRule => p.weekRules.find((r) => r.week === week) ?? weekRule(week);

/** The deload week, if the program has one. */
export const deloadWeek = (p: WorkoutProgram): number | undefined => p.weekRules.find((r) => r.isDeload)?.week;

/** What the calendar says for a date: a training day id, or null for rest. */
export function scheduledOn(p: WorkoutProgram, date: Date, utc = false): ScheduleSlot {
  if (p.schedule.length !== 7) return null;
  // JS weekday: 0 = Sunday … 6 = Saturday. Schedule index: 0 = Monday.
  const weekday = utc ? date.getUTCDay() : date.getDay();
  return p.schedule[(weekday + 6) % 7];
}

// MARK: - Resolved (one concrete week and day)

export interface ResolvedPrescription {
  slot: ExercisePrescription;
  week: number;
  sets: number;
  reps: RepRange;
  effort: Effort;
  lastSetNote?: string;
  weekNote?: string;
  isDeload: boolean;
  /** Rest after the set: superset rules applied. */
  restSeconds: number;
  /** Rest between the paired exercises of a superset, when this is the first of the pair. */
  supersetRestBetween?: number;
}

export const rxExercise = (p: ResolvedPrescription): Exercise => Catalog.exercise(p.slot.exerciseID);

/** "3 × 8–12" with " per leg" or " per arm" for per-side work. */
export function setsText(p: ResolvedPrescription): string {
  const side = p.slot.laterality === 'perArm' ? ' per arm' : p.slot.laterality === 'perLeg' ? ' per leg' : '';
  return `${p.sets} × ${repRangeText(p.reps)}${side}`;
}

export function effortText(e: Effort): string {
  return e.type === 'rir' ? `RIR ${rirText(e.rir)}` : 'lowering reps · stop when you lose control';
}

function fmtRest(s: number): string {
  if (s < 120) return `${s} s`;
  const m = s / 60;
  return m === Math.round(m) ? `${m} min` : `${m.toFixed(1)} min`;
}

export function restText(p: ResolvedPrescription): string {
  const [lo, hi] = p.slot.rest;
  let range: string;
  if (lo === hi) range = fmtRest(lo);
  else if ((lo >= 120) === (hi >= 120)) {
    // Same unit: "60–90 s", "2.5–3 min".
    const unit = lo >= 120 ? ' min' : ' s';
    range = `${fmtRest(lo).replace(unit, '')}–${fmtRest(hi)}`;
  } else range = `${fmtRest(lo)}–${fmtRest(hi)}`;
  if (isPerSide(p.slot.laterality) && p.slot.sideRest === undefined) return `~${range}, alternating sides`;
  if (p.slot.sideRest !== undefined) return `${fmtRest(p.slot.sideRest)} between sides · ${range} between rounds`;
  return range;
}

export interface ResolvedSession {
  programID: string;
  week: number;
  day: ProgramDay;
  rule: WeekRule;
  exercises: ResolvedPrescription[];
}

/** The concrete prescription for one day of one week, with the week table, deload and set adjustments applied. */
export function resolveSession(program: WorkoutProgram, dayID: string, week: number,
                               setAdjustments: Record<string, number> = {}): ResolvedSession | undefined {
  const day = programDay(program, dayID);
  if (!day) return undefined;
  const rule = ruleFor(program, week);
  // Week 1 calibration: the last non-optional isolation with an RIR target.
  const calibrationSlot = rule.calibrate
    ? [...day.exercises].reverse().find((s) => s.kind === 'isolation' && !s.isOptional && s.effort.type === 'rir')?.id
    : undefined;

  const exercises = day.exercises.map((slot): ResolvedPrescription => {
    const override = slot.weekOverrides[week];
    let effort = slot.effort;
    if (slot.effort.type === 'rir') {
      const exception = rule.rirExceptions[slot.exerciseID];
      const column = slot.kind === 'compound' ? rule.compoundRIR : rule.isolationRIR;
      if (exception) effort = { type: 'rir', rir: exception };
      else if (column) effort = { type: 'rir', rir: column };
    }
    if (override?.effort) effort = override.effort;

    let sets = override?.sets ?? applySetRule(rule.sets, slot.sets);
    if (override?.sets === undefined && !rule.isDeload) sets = Math.max(1, sets + (setAdjustments[slot.id] ?? 0));

    let lastSetNote: string | undefined;
    if (!rule.isDeload) {
      lastSetNote = slot.lastSetNote;
      if (slot.kind === 'isolation' && slot.effort.type === 'rir' && rule.isolationLastSetNote) lastSetNote = rule.isolationLastSetNote;
      if (slot.id === calibrationSlot) lastSetNote = 'Calibration: take this last set to true failure';
    }

    let rest = slot.rest[1];
    let between: number | undefined;
    const spec = slot.supersetGroup ? day.supersets.find((s) => s.group === slot.supersetGroup) : undefined;
    if (spec) {
      const members = day.exercises.filter((e) => e.supersetGroup === slot.supersetGroup);
      if (members[0]?.id === slot.id) {
        between = spec.restBetween[1];
        rest = spec.restBetween[1];
      } else {
        rest = spec.restAfter;
      }
    }

    return {
      slot, week, sets, reps: override?.reps ?? slot.reps, effort, lastSetNote, weekNote: override?.note,
      isDeload: rule.isDeload, restSeconds: rest, supersetRestBetween: between,
    };
  });
  return { programID: program.id, week, day, rule, exercises };
}

// MARK: - Progress (stored)

export interface FatigueCheckIn {
  jointPain: boolean;
  stillSore: boolean;
  poorSleepOrMotivation: boolean;
  /** Computed from logs when the check-in was answered. */
  repsDropped: boolean;
}

export const checkInFlags = (c: FatigueCheckIn) =>
  [c.jointPain, c.stillSore, c.poorSleepOrMotivation, c.repsDropped].filter(Boolean).length;
/** Two or more flags: deload early. */
export const suggestsDeload = (c: FatigueCheckIn) => checkInFlags(c) >= 2;

export interface ProgramProgress {
  programID: string;
  startedAt: number;
  week: number;
  /** Week → day ids logged. */
  completed: Record<number, string[]>;
  /** Week → day ids skipped. */
  skipped: Record<number, string[]>;
  /** Jump to the deload week once the current week ends. */
  deloadNext: boolean;
  /** Slot id → set change (stall rule: −1). */
  setAdjustments: Record<string, number>;
  /** Slot id → extra reps on the top of the range (big-jump rule). */
  rangeExtensions: Record<string, number>;
  checkIns: Record<number, FatigueCheckIn>;
  /** Every day of the last week is done. */
  isFinished: boolean;
}

export function newProgress(programID: string, startedAt = Date.now(), week = 1): ProgramProgress {
  return {
    programID, startedAt, week, completed: {}, skipped: {}, deloadNext: false, setAdjustments: {},
    rangeExtensions: {}, checkIns: {}, isFinished: false,
  };
}

export function isDone(p: ProgramProgress, dayID: string, week = p.week): boolean {
  return (p.completed[week] ?? []).includes(dayID) || (p.skipped[week] ?? []).includes(dayID);
}

/** Next training day this week, in schedule order. */
export function nextDayID(p: ProgramProgress, program: WorkoutProgram): string | undefined {
  if (p.isFinished) return undefined;
  return dayOrder(program).find((d) => !isDone(p, d));
}

export function nextSession(p: ProgramProgress, program: WorkoutProgram): ResolvedSession | undefined {
  const id = nextDayID(p, program);
  return id ? resolveSession(program, id, p.week, p.setAdjustments) : undefined;
}

function advanceIfWeekDone(p: ProgramProgress, program: WorkoutProgram) {
  if (!dayOrder(program).every((d) => isDone(p, d))) return;
  const wasDeload = ruleFor(program, p.week).isDeload;
  if (wasDeload || p.week >= program.weeks) {
    p.isFinished = true;
    return;
  }
  const deload = deloadWeek(program);
  if (p.deloadNext && deload !== undefined) {
    p.week = deload;
    p.deloadNext = false;
  } else {
    p.week += 1;
  }
}

/** Mutates `p`. */
export function completeDay(p: ProgramProgress, dayID: string, week: number, program: WorkoutProgram) {
  if ((p.completed[week] ?? []).includes(dayID)) return;
  p.completed[week] = [...(p.completed[week] ?? []), dayID];
  if (p.skipped[week]) p.skipped[week] = p.skipped[week].filter((d) => d !== dayID);
  advanceIfWeekDone(p, program);
}

/** Mutates `p`. */
export function skipDay(p: ProgramProgress, dayID: string, program: WorkoutProgram) {
  if (isDone(p, dayID)) return;
  p.skipped[p.week] = [...(p.skipped[p.week] ?? []), dayID];
  advanceIfWeekDone(p, program);
}

/** Starts the deload week now, from its first day. Mutates `p`. */
export function deloadNow(p: ProgramProgress, program: WorkoutProgram) {
  const deload = deloadWeek(program);
  if (deload === undefined) return;
  p.week = deload;
  p.completed[deload] = [];
  p.skipped[deload] = [];
  p.deloadNext = false;
  p.isFinished = false;
}

/** The week just finished still needs its fatigue check-in. Not asked during or after the deload. */
export function checkInDue(p: ProgramProgress, program: WorkoutProgram): number | undefined {
  if (p.isFinished || p.deloadNext || ruleFor(program, p.week).isDeload) return undefined;
  const candidate = p.week - 1;
  if (candidate < 1 || p.checkIns[candidate] || !(p.completed[candidate] ?? []).length) return undefined;
  return candidate;
}

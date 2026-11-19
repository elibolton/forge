import {
  type Exercise, type Gym, type LoggedExercise, type RepRange, type UserPlan, type WorkoutRecord,
  POUNDS_PER_KG, defaultPlan, gymIncrementKg, gymRound, isBodyweight, loadEquipment, repRange, repRangeText, roundLoad,
  workingSets,
} from './models';
import { Planner } from './planner';
import {
  type LoadStep, type ProgramProgress, type ResolvedPrescription, effortRIR, isEccentric, rirText, rxExercise,
} from './program';
import { estimatedOneRM, weightForReps } from './strength';

export type ProgressionAction =
  /** Big-jump rule: the next load step is more than ~10%, so add reps to the top of the range first. */
  | { type: 'extendRange'; by: number }
  /** The extended range was reached and load went up: back to the normal range. */
  | { type: 'resetRange' }
  /** Stall rule: no progress for 2 weeks, cut a set. */
  | { type: 'dropSet' };

/** What to load and aim for on a program exercise this week, and why. */
export interface ProgressionSuggestion {
  /** kg; null for bodyweight or lowering-only work. */
  weight: number | null;
  /** Target reps per working set. */
  reps: number;
  /** The range this week, including any big-jump extension. */
  range: RepRange;
  reason: string;
  action?: ProgressionAction;
}

/** Load added once every set reaches the top of the range, in kg. */
export function stepKg(step: LoadStep, exercise: Exercise, gym: Gym): number {
  switch (step) {
    case 'lowerBodyBarbell': return gym.usesPounds ? 10 / POUNDS_PER_KG : 5;
    case 'upperBarbell': return gym.usesPounds ? 5 / POUNDS_PER_KG : 2.5;
    case 'dumbbell': return gymIncrementKg(gym, 'dumbbell');
    case 'cablePin': return gymIncrementKg(gym, loadEquipment(exercise) ?? 'cable');
    case 'bodyweight': return 0;
  }
}

/** Rounds to something loadable; exercises with no load equipment (a held plate) use 2.5 kg / 5 lb. */
export function roundFor(kg: number, exercise: Exercise, gym: Gym): number {
  const eq = loadEquipment(exercise);
  if (eq) return gymRound(gym, kg, eq);
  if (gym.usesPounds) return roundLoad(kg * POUNDS_PER_KG, 5, 0) / POUNDS_PER_KG;
  return roundLoad(kg, 2.5, 0);
}

export function formatLoad(kg: number, pounds: boolean): string {
  const v = Math.round((pounds ? kg * POUNDS_PER_KG : kg) * 2) / 2;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${pounds ? 'lb' : 'kg'}`;
}

const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
const minOf = (xs: number[]) => (xs.length ? Math.min(...xs) : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

interface Past { logged: LoggedExercise; isDeload: boolean; slotMatches: boolean }

/** Newest first; same slot preferred, then the same exercise logged anywhere. */
function pastSessions(p: ResolvedPrescription, history: WorkoutRecord[]): Past[] {
  const all: Past[] = [];
  for (const record of [...history].sort((a, b) => b.date - a.date)) {
    const logged = record.exercises.find((x) => x.exerciseID === p.slot.exerciseID && workingSets(x).length > 0);
    if (logged) all.push({ logged, isDeload: record.program?.isDeload ?? false, slotMatches: logged.slotID === p.slot.id });
  }
  const same = all.filter((x) => x.slotMatches);
  return same.length ? same : all;
}

/** No load or rep gain across the last two week-to-week comparisons. `sessions` is newest first. */
export function isStalled(sessions: LoggedExercise[]): boolean {
  if (sessions.length < 3) return false;
  const progressed = (newer: LoggedExercise, older: LoggedExercise) => {
    const a = maxOf(workingSets(newer).map((s) => s.weight)), b = maxOf(workingSets(older).map((s) => s.weight));
    if (a > b + 0.01) return true;
    if (a < b - 0.01) return false;
    return sum(workingSets(newer).map((s) => s.reps)) > sum(workingSets(older).map((s) => s.reps));
  };
  return !progressed(sessions[0], sessions[1]) && !progressed(sessions[1], sessions[2]);
}

/**
 * Double progression for program exercises. Each exercise appears once a week, so this compares against
 * the most recent session of the same exercise (preferring the same program slot).
 */
export function suggest(p: ResolvedPrescription, args: {
  progress?: ProgramProgress; history: WorkoutRecord[]; gym: Gym; plan?: UserPlan; now?: number;
}): ProgressionSuggestion {
  const { progress, history, gym, plan = defaultPlan(), now = Date.now() } = args;
  const e = rxExercise(p);
  const fmt = (kg: number) => formatLoad(kg, gym.usesPounds);
  const ext = p.isDeload ? 0 : (progress?.rangeExtensions[p.slot.id] ?? 0);
  const range = repRange(p.reps.lower, p.reps.upper + ext);
  const loaded = p.slot.loadStep !== 'bodyweight' && !isBodyweight(e);
  const rir = effortRIR(p.effort);

  const past = pastSessions(p, history);
  const last = past[0]?.logged;
  if (!last) {
    if (!loaded) {
      const reason = isEccentric(p.effort)
        ? 'Lower as slowly as you can; end the set when you lose control'
        : `First session: aim for ${range.lower}+ reps`;
      return { weight: null, reps: range.lower, range, reason };
    }
    const known = estimatedOneRM(e.id, history, now);
    const oneRM = known ?? new Planner({ plan, gym, history }).startingOneRM(e, now);
    const weight = roundFor(weightForReps(range.lower, rir?.high ?? 2, oneRM), e, gym);
    const source = known === undefined ? 'Starting guess' : 'From your history';
    return {
      weight, reps: range.lower, range,
      reason: `${source}: adjust so set 1 lands at ${range.lower} reps with RIR ${rir ? rirText(rir) : '2'}`,
    };
  }

  const working = workingSets(last);
  const lastLoad = maxOf(working.map((s) => s.weight));
  const repsList = working.map((s) => `${s.reps}`).join(', ');

  if (p.isDeload) {
    return {
      weight: loaded ? lastLoad : null, reps: range.lower, range,
      reason: loaded ? 'Deload: same load or up to 10% lighter, stop with reps to spare' : 'Deload: easy reps, nowhere near failure',
    };
  }

  const targetRIR = last.targetRIR ?? rir?.low ?? 0;
  const allTop = working.length > 0 && working.every((s) => s.reps >= range.upper && (s.rir ?? targetRIR) >= targetRIR);
  const minReps = minOf(working.map((s) => s.reps));

  let s: ProgressionSuggestion;
  if (!loaded) {
    if (allTop) {
      s = { weight: null, reps: range.upper, range,
        reason: isEccentric(p.effort) ? 'Top of the range last time: lower even slower' : 'Top of the range last time: slow the reps down' };
    } else {
      const reps = Math.min(range.upper, Math.max(range.lower, minReps + 1));
      s = { weight: null, reps, range, reason: `Aim for ${reps}+ on every set (last: ${repsList})` };
    }
  } else if (allTop) {
    const step = stepKg(p.slot.loadStep, e, gym);
    if (ext === 0 && lastLoad > 0 && step > lastLoad * 0.10) {
      const extended = repRange(p.reps.lower, p.reps.upper + 4);
      s = { weight: lastLoad, reps: Math.min(extended.upper, range.upper + 1), range: extended,
        reason: `Next jump (+${fmt(step)}) is over 10% of the load: extend to ${repRangeText(extended)} reps first`,
        action: { type: 'extendRange', by: 4 } };
    } else {
      const next = roundFor(lastLoad + step, e, gym);
      const base = repRange(p.reps.lower, p.reps.upper);
      s = { weight: next, reps: base.lower, range: base, reason: `Top of the range on every set: +${fmt(next - lastLoad)}`,
        action: ext > 0 ? { type: 'resetRange' } : undefined };
    }
  } else {
    const reps = Math.min(range.upper, Math.max(range.lower, minReps + 1));
    const reason = minReps < range.lower
      ? `Below the range last time (${repsList}): keep the load, build back up`
      : `Add reps first: aim for ${reps}+ on every set (last: ${repsList})`;
    s = { weight: lastLoad, reps, range, reason };
  }

  if (!s.action && p.sets > 1 && (progress?.setAdjustments[p.slot.id] ?? 0) === 0
      && isStalled(past.filter((x) => !x.isDeload && x.slotMatches).map((x) => x.logged))) {
    s.action = { type: 'dropSet' };
    s.reason += ' · No progress for 2 weeks: drop a set';
  }
  return s;
}

// MARK: Fatigue

/** Slots where reps dropped at the same load compared with the week before. */
export function repsDropped(history: WorkoutRecord[], programID: string, week: number): string[] {
  if (week <= 1) return [];
  const byWeek = (w: number) => {
    const out = new Map<string, LoggedExercise>();
    for (const r of history) {
      if (r.program?.programID !== programID || r.program.week !== w || r.program.isDeload) continue;
      for (const l of r.exercises) if (workingSets(l).length) out.set(l.slotID ?? l.exerciseID, l);
    }
    return out;
  };
  const now = byWeek(week), before = byWeek(week - 1);
  const keys: string[] = [];
  for (const [key, cur] of now) {
    const prev = before.get(key);
    if (!prev) continue;
    const a = maxOf(workingSets(cur).map((s) => s.weight)), b = maxOf(workingSets(prev).map((s) => s.weight));
    if (Math.abs(a - b) >= 0.01) continue;
    const rn = workingSets(cur).map((s) => s.reps), rp = workingSets(prev).map((s) => s.reps);
    // Compare like for like when a set was cut.
    const n = Math.min(rn.length, rp.length);
    if (sum(rn.slice(0, n)) < sum(rp.slice(0, n))) keys.push(key);
  }
  return keys.sort();
}

/** The automatic flag: reps dropped at the same load on 2+ exercises. */
export function repsDroppedFlag(history: WorkoutRecord[], programID: string, week: number): boolean {
  return repsDropped(history, programID, week).length >= 2;
}

export const ProgramProgression = { stepKg, round: roundFor, suggest, isStalled, repsDropped, repsDroppedFlag, format: formatLoad };

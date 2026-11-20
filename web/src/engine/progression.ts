import {
  type Exercise, type Gym, type LoggedExercise, type RepRange, type UserPlan, type WorkoutRecord,
  DAY_MS, POUNDS_PER_KG, defaultPlan, gymIncrementKg, gymRound, gymRoundUp, isBodyweight, loadEquipment, plateSides, repRange,
  repRangeText, roundLoad,
  straightSets, workingSets,
} from './models';
import { Planner } from './planner';
import {
  type LoadStep, type ProgramProgress, type ResolvedPrescription, effortRIR, isEccentric, repsLeftText, rxExercise,
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

/** The rounding grid `roundFor` uses for this exercise, in kg. */
export function gridKg(exercise: Exercise, gym: Gym): number {
  const eq = loadEquipment(exercise);
  if (eq) return gymIncrementKg(gym, eq, plateSides(exercise));
  return gym.usesPounds ? 5 / POUNDS_PER_KG : 2.5;
}

/**
 * The next load once every set hit the top of the range: the lightest loadable weight at least the
 * slot's step on, and always heavier than the last load, so it never comes out "+0 kg" when the step is
 * finer than the plates. Undefined when nothing heavier can be loaded at this gym.
 */
export function nextLoad(lastLoad: number, step: LoadStep, exercise: Exercise, gym: Gym): number | undefined {
  let next = roundUpFor(roundFor(lastLoad, exercise, gym) + stepKg(step, exercise, gym), exercise, gym);
  // Short of a full step (near the most the plates make), the next weight up is still progress.
  if (next === undefined || next <= lastLoad + 0.005) next = roundUpFor(lastLoad + 0.01, exercise, gym);
  return next !== undefined && next > lastLoad + 0.005 ? next : undefined;
}

/** Rounds to something loadable; exercises with no load equipment (a held plate) use 2.5 kg / 5 lb. */
export function roundFor(kg: number, exercise: Exercise, gym: Gym): number {
  const eq = loadEquipment(exercise);
  if (eq) return gymRound(gym, kg, eq, plateSides(exercise));
  if (gym.usesPounds) return roundLoad(kg * POUNDS_PER_KG, 5, 0) / POUNDS_PER_KG;
  return roundLoad(kg, 2.5, 0);
}

/** The lightest loadable weight at or above `kg`, or undefined past the most the gym's plates make. */
export function roundUpFor(kg: number, exercise: Exercise, gym: Gym): number | undefined {
  const eq = loadEquipment(exercise);
  if (eq) return gymRoundUp(gym, kg, eq, plateSides(exercise));
  const step = gym.usesPounds ? 5 / POUNDS_PER_KG : 2.5;
  return Math.ceil(kg / step - 1e-6) * step;
}

export function formatLoad(kg: number, pounds: boolean): string {
  const v = Math.round((pounds ? kg * POUNDS_PER_KG : kg) * 2) / 2;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${pounds ? 'lb' : 'kg'}`;
}

const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
const minOf = (xs: number[]) => (xs.length ? Math.min(...xs) : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

interface Past { logged: LoggedExercise; date: number; isDeload: boolean; slotMatches: boolean }

/** Past this long without the exercise, the last session is no guide: ease back in from a decayed estimate. */
export const TIME_AWAY_DAYS = 14;

/**
 * Newest first; same slot preferred, then the same exercise logged anywhere. With the exercise in two
 * slots of one workout, the entry for this slot is the one read. Sessions with only drop sets are skipped.
 */
function pastSessions(p: ResolvedPrescription, history: WorkoutRecord[]): Past[] {
  const all: Past[] = [];
  const counts = (x: LoggedExercise) => x.exerciseID === p.slot.exerciseID && straightSets(x).length > 0;
  for (const record of [...history].sort((a, b) => b.date - a.date)) {
    const logged = record.exercises.find((x) => counts(x) && x.slotID === p.slot.id) ?? record.exercises.find(counts);
    if (logged) {
      all.push({ logged, date: record.date, isDeload: record.program?.isDeload ?? false, slotMatches: logged.slotID === p.slot.id });
    }
  }
  const same = all.filter((x) => x.slotMatches);
  return same.length ? same : all;
}

/** No load or rep gain across the last two week-to-week comparisons. `sessions` is newest first. */
export function isStalled(sessions: LoggedExercise[]): boolean {
  if (sessions.length < 3) return false;
  const progressed = (newer: LoggedExercise, older: LoggedExercise) => {
    const a = maxOf(straightSets(newer).map((s) => s.weight)), b = maxOf(straightSets(older).map((s) => s.weight));
    if (a > b + 0.01) return true;
    if (a < b - 0.01) return false;
    return sum(straightSets(newer).map((s) => s.reps)) > sum(straightSets(older).map((s) => s.reps));
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
  // A deload is lighter on purpose: the last real week is what to build on (after a restart too).
  const lastPast = past.find((x) => !x.isDeload) ?? past[0];
  const last = lastPast?.logged;
  const working = last ? straightSets(last) : [];
  const lastLoad = maxOf(working.map((s) => s.weight));
  const daysAway = past[0] ? (now - past[0].date) / DAY_MS : 0;
  const away = daysAway > TIME_AWAY_DAYS;
  // Nothing to build on: never done, weeks away, or a loaded exercise saved with no weight.
  if (!last || away || (loaded && lastLoad <= 0)) {
    const back = away ? `Back after ${Math.round(daysAway / 7)} weeks away` : undefined;
    if (!loaded) {
      const reason = back
        ? `${back}: ease in, aim for ${range.lower}+ reps`
        : isEccentric(p.effort)
          ? 'Lower as slowly as you can; end the set when you lose control'
          : `First session: aim for ${range.lower}+ reps`;
      return { weight: null, reps: range.lower, range, reason };
    }
    const known = estimatedOneRM(e.id, history, now);
    const oneRM = known ?? new Planner({ plan, gym, history }).startingOneRM(e, now);
    const weight = roundFor(weightForReps(range.lower, rir?.high ?? 2, oneRM), e, gym);
    const source = back ? `${back}, easing in` : known === undefined ? 'Starting guess' : 'From your history';
    return {
      weight, reps: range.lower, range,
      reason: `${source}: adjust so set 1 lands at ${range.lower} reps with ${rir ? repsLeftText(rir) : '2 reps left'}`,
    };
  }

  const repsList = working.map((s) => `${s.reps}`).join(', ');

  if (p.isDeload) {
    return {
      weight: loaded ? lastLoad : null, reps: range.lower, range,
      reason: loaded ? 'Deload: same load or up to 10% lighter, stop with reps to spare' : 'Deload: easy reps, nowhere near failure',
    };
  }

  const targetRIR = last.targetRIR ?? rir?.low ?? 0;
  // Failure sets and the last set (the program's calibration and "0 RIR on the last set" notes) are
  // meant to go below the target, so their RIR doesn't hold progression back.
  const lastIndex = working.length - 1;
  const allTop = working.length > 0 && working.every((s, i) =>
    s.reps >= range.upper && (s.type === 'failure' || i === lastIndex || (s.rir ?? targetRIR) >= targetRIR));
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
    const next = nextLoad(lastLoad, p.slot.loadStep, e, gym);
    const step = next === undefined ? 0 : next - lastLoad;
    if (next === undefined) {
      // Nothing heavier fits on the bar here: more reps is the way on.
      s = { weight: roundFor(lastLoad, e, gym), reps: range.upper, range, reason: 'Top of your plates: add reps past the range' };
    } else if (ext === 0 && lastLoad > 0 && step > lastLoad * 0.10) {
      const extended = repRange(p.reps.lower, p.reps.upper + 4);
      s = { weight: lastLoad, reps: Math.min(extended.upper, range.upper + 1), range: extended,
        reason: `Next jump (+${fmt(step)}) is over 10% of the load: extend to ${repRangeText(extended)} reps first`,
        action: { type: 'extendRange', by: 4 } };
    } else {
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

  // Holding the top of the range isn't a stall (reps can't go higher). Only this run of the program
  // counts: after a restart, the old run's weeks say nothing about progress now.
  const thisRun = past.filter((x) => !x.isDeload && x.slotMatches && (!progress || x.date >= progress.startedAt));
  if (!s.action && !allTop && p.sets > 1 && (progress?.setAdjustments[p.slot.id] ?? 0) === 0
      && isStalled(thisRun.map((x) => x.logged))) {
    s.action = { type: 'dropSet' };
    s.reason += ' · No progress for 2 weeks: drop a set';
  }
  return s;
}

// MARK: Fatigue

/**
 * Slots where reps dropped at the same load compared with the week before. Only workouts since
 * `since` (the current run's start) count, and the newest log of a slot in a week wins, so an older run
 * of the same program, or a week done twice after a jump back, doesn't decide.
 */
export function repsDropped(history: WorkoutRecord[], programID: string, week: number, since = -Infinity): string[] {
  if (week <= 1) return [];
  const byWeek = (w: number) => {
    const out = new Map<string, { l: LoggedExercise; date: number }>();
    for (const r of history) {
      if (r.date < since || r.program?.programID !== programID || r.program.week !== w || r.program.isDeload) continue;
      for (const l of r.exercises) {
        const key = l.slotID ?? l.exerciseID;
        const seen = out.get(key);
        if (workingSets(l).length && (!seen || r.date > seen.date)) out.set(key, { l, date: r.date });
      }
    }
    return new Map([...out].map(([k, v]) => [k, v.l]));
  };
  const now = byWeek(week), before = byWeek(week - 1);
  const keys: string[] = [];
  for (const [key, cur] of now) {
    const prev = before.get(key);
    if (!prev) continue;
    const a = maxOf(straightSets(cur).map((s) => s.weight)), b = maxOf(straightSets(prev).map((s) => s.weight));
    if (Math.abs(a - b) >= 0.01) continue;
    const rn = straightSets(cur).map((s) => s.reps), rp = straightSets(prev).map((s) => s.reps);
    // Compare like for like when a set was cut.
    const n = Math.min(rn.length, rp.length);
    if (sum(rn.slice(0, n)) < sum(rp.slice(0, n))) keys.push(key);
  }
  return keys.sort();
}

/** The automatic flag: reps dropped at the same load on 2+ exercises. */
export function repsDroppedFlag(history: WorkoutRecord[], programID: string, week: number, since?: number): boolean {
  return repsDropped(history, programID, week, since).length >= 2;
}

export const ProgramProgression = { stepKg, round: roundFor, suggest, isStalled, repsDropped, repsDroppedFlag, format: formatLoad };

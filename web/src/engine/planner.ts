import { Catalog } from './catalog';
import {
  type DayFocus, type Exercise, type ExternalActivity, type Goal, type Gym, type Level, type LoggedExercise,
  type Muscle, type MuscleMap, type RecoveryOverride, type UserPlan, type WorkoutRecord,
  DAY_MS, focusMuscles, gymBaseLoadKg, gymIncrementKg, gymRound, isBodyweight, levelRank, loadEquipment, muscleName,
  straightSets, workingSets,
} from './models';
import { qualityOf, qualityScore, tierKey } from './quality';
import { computeRecovery } from './recovery';
import { type Slot, templateFor } from './templates';
import { bestReps, estimatedOneRM, oneRM as epley, weightForReps } from './strength';

// MARK: - Output

export interface PlannedSet {
  /** kg; null for bodyweight. */
  weight: number | null;
  /** Reps, or seconds for timed exercises. */
  reps: number;
  isWarmup: boolean;
  /** Last set to failure (Max Effort), used to recalibrate the 1RM. */
  isAMRAP: boolean;
}

export interface PlannedExercise {
  exercise: Exercise;
  sets: PlannedSet[];
  restSeconds: number;
  targetRIR: number;
  /** Short human-readable reasons this exercise and load were picked. */
  reasons: string[];
  /** Exercises sharing a group are done as a superset, alternating sets. */
  supersetGroup?: string;
}

export const plannedWorkingSets = (p: PlannedExercise) => p.sets.filter((s) => !s.isWarmup);

export interface PlannedWorkout {
  focus: DayFocus;
  targetMuscles: Muscle[];
  exercises: PlannedExercise[];
  estimatedMinutes: number;
  recovery: MuscleMap;
  /** Shown with the plan, e.g. why it's shorter than the time you set. */
  note?: string;
}

// MARK: - Goal schemes

export interface Scheme {
  compoundReps: [number, number];
  isolationReps: [number, number];
  sets: number;
  compoundExtraSets: number;
  rir: number;
  restCompound: number;
  restIsolation: number;
  /** Default fractional sets per muscle per week (synergist sets count half). */
  weeklySetTarget: number;
  /** Direct sets every muscle the day trains gets, even in a short session. */
  sessionMin: number;
  /** Fractional sets per muscle per session past which extra sets add no detectable growth. */
  sessionSoftCap: number;
  /** Most working sets planned for one exercise. */
  maxSetsPerExercise: number;
}

/**
 * Prescriptions and volume by goal and level. Ranges come from the research report
 * (reports/Evidence based workout building.md); the exact defaults inside them are design choices.
 */
export function makeScheme(goal: Goal, experience: Level): Scheme {
  const lvl = levelRank(experience);
  // [weekly target, session minimum, session soft cap] for beginner, intermediate, advanced.
  const volume = (rows: [number, number, number][]) => rows[lvl];
  const s = ((): Scheme => {
    const mk = (compoundReps: [number, number], isolationReps: [number, number], sets: number, compoundExtraSets: number,
                rir: number, restCompound: number, restIsolation: number, v: [number, number, number]): Scheme => ({
      compoundReps, isolationReps, sets, compoundExtraSets, rir, restCompound, restIsolation,
      weeklySetTarget: v[0], sessionMin: v[1], sessionSoftCap: v[2], maxSetsPerExercise: 4,
    });
    switch (goal) {
      case 'buildMuscle': return mk([6, 10], [10, 15], 3, 1, 2, 120, 75, volume([[10, 2, 8], [15, 3, 11], [20, 3, 12]]));
      case 'getStronger': return mk([3, 6], [8, 12], 3, 1, 2, 180, 90, volume([[9, 2, 8], [12, 2, 10], [13, 2, 11]]));
      case 'powerlifting': return mk([1, 5], [8, 12], 3, 2, 2, 240, 90, volume([[9, 2, 8], [10, 2, 10], [12, 2, 11]]));
      case 'getLean': return mk([6, 10], [10, 15], 3, 0, 2, 90, 60, volume([[8, 2, 6], [12, 2, 9], [14, 3, 10]]));
      case 'improveFitness': return mk([8, 12], [10, 15], 3, 0, 3, 90, 60, volume([[6, 2, 6], [9, 2, 8], [10, 2, 10]]));
      case 'reduceBodyweight': return mk([8, 12], [12, 15], 3, 0, 3, 90, 60, volume([[8, 2, 6], [12, 2, 9], [14, 3, 10]]));
    }
  })();
  if (experience === 'beginner') {
    s.sets = Math.max(2, s.sets - 1);
    s.compoundExtraSets = Math.min(s.compoundExtraSets, 1);
    s.rir += 1;
    // Beginners learn lifts faster with moderate loads, whatever the goal.
    s.compoundReps = [8, 12];
    s.maxSetsPerExercise = 3;
  } else if (experience === 'advanced') {
    s.compoundExtraSets += 1;
  }
  if (goal === 'getStronger' || goal === 'powerlifting') s.maxSetsPerExercise = 5;
  return s;
}

// MARK: - Deterministic randomness

const MASK = (1n << 64n) - 1n;

/** SplitMix64, so the same seed regenerates the same workout. */
export class SeededRandom {
  private state: bigint;
  constructor(seed: number | bigint) { this.state = (BigInt(seed) + 0x9E3779B97F4A7C15n) & MASK; }

  nextUInt64(): bigint {
    this.state = (this.state + 0x9E3779B97F4A7C15n) & MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK;
    return z ^ (z >> 31n);
  }

  next(lo: number, hi: number): number {
    const unit = Number(this.nextUInt64() >> 11n) / 2 ** 53;
    return lo + unit * (hi - lo);
  }
}

/** Local calendar day number, the default seed so a day's workout is stable. */
export function dayNumber(t: number): number {
  return Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / DAY_MS);
}

/** Muscle groups the "Fresh Muscles" split chooses between. */
const FRESH_GROUPS: Muscle[][] = [
  ['chest'], ['lats', 'upperBack'], ['frontDelts', 'sideDelts', 'rearDelts'], ['biceps', 'triceps'], ['quads', 'glutes'], ['hamstrings', 'glutes'],
];

const avg = (recovery: MuscleMap, muscles: Muscle[]) =>
  muscles.reduce((t, m) => t + (recovery[m] ?? 1), 0) / Math.max(1, muscles.length);

const ANTAGONISTS: [string, string][] = [
  ['horizontalPush', 'horizontalPull'], ['verticalPush', 'verticalPull'], ['biceps', 'triceps'], ['quads', 'hamstrings'], ['chest', 'upperBack'],
];

/** Rest between the two exercises of a pair; the full rest comes after the pair. */
export const SUPERSET_REST_BETWEEN = 30;

/**
 * Pairs exercises that don't compete for the same muscles into supersets, placed back to back.
 * The first exercise (the main lift) and anything with long rests or timed sets stays on its own.
 * Opposing movements (push with pull, biceps with triceps) are preferred.
 */
export function pairSupersets(list: PlannedExercise[]): PlannedExercise[] {
  const canPair = (p: PlannedExercise, i: number) =>
    i > 0 && !p.exercise.isTimed && p.exercise.pattern !== 'mobility' && p.restSeconds < 180 && !p.supersetGroup;
  const muscles = (p: PlannedExercise) => [...p.exercise.primary, ...p.exercise.secondary];
  const clash = (a: PlannedExercise, b: PlannedExercise) =>
    a.exercise.primary.some((m) => muscles(b).includes(m)) || b.exercise.primary.some((m) => muscles(a).includes(m));
  const tags = (p: PlannedExercise) => [p.exercise.pattern as string, ...p.exercise.primary];
  const antagonist = (a: PlannedExercise, b: PlannedExercise) =>
    ANTAGONISTS.some(([x, y]) => (tags(a).includes(x) && tags(b).includes(y)) || (tags(a).includes(y) && tags(b).includes(x)));

  const used = new Set<number>();
  const out: PlannedExercise[] = [];
  let group = 0;
  list.forEach((a, i) => {
    if (used.has(i)) return;
    used.add(i);
    let best = -1, bestScore = -1;
    if (canPair(a, i)) {
      list.forEach((b, j) => {
        if (j <= i || used.has(j) || !canPair(b, j) || clash(a, b)) return;
        const score = (antagonist(a, b) ? 2 : 0) + (a.exercise.isCompound === b.exercise.isCompound ? 1 : 0);
        if (score > bestScore) { best = j; bestScore = score; }
      });
    }
    if (best < 0) { out.push(a); return; }
    used.add(best);
    const b = list[best];
    const name = String.fromCharCode(65 + group++);
    out.push({ ...a, restSeconds: SUPERSET_REST_BETWEEN, supersetGroup: name },
      { ...b, restSeconds: Math.max(a.restSeconds, b.restSeconds), supersetGroup: name });
  });
  return out;
}

/** Breaks a pair up again (its partner was dropped), giving the one left its normal rest. */
function unpair(list: PlannedExercise[], group: string): PlannedExercise[] {
  return list.map((p) => {
    if (p.supersetGroup !== group) return p;
    const { supersetGroup: _, ...rest } = p;
    return { ...rest, restSeconds: Math.max(p.restSeconds, 60) };
  });
}

/**
 * Time model (research report, spec steps 12–13): about 3 s per rep plus 10 s to set up each set,
 * 70 s per warm-up set and 90 s to move to the next exercise. Rest after the last set is replaced by
 * that move. Timed sets count their seconds.
 */
export const SECONDS_PER_REP = 3;
export const SET_SETUP_SECONDS = 10;
export const WARMUP_SET_SECONDS = 70;
export const TRANSITION_SECONDS = 90;

/** Seconds a planned exercise takes, including rest and warm-ups. */
export function plannedSeconds(p: PlannedExercise): number {
  const working = plannedWorkingSets(p);
  const work = working.reduce((t, s) => t + (p.exercise.isTimed ? s.reps : s.reps * SECONDS_PER_REP) + SET_SETUP_SECONDS, 0);
  const rests = Math.max(0, working.length - 1) * p.restSeconds;
  return work + rests + (p.sets.length - working.length) * WARMUP_SET_SECONDS + TRANSITION_SECONDS;
}

/** Minutes a list of exercises takes, including rest and warm-ups. Recompute after edits. */
export function estimatedMinutes(exercises: PlannedExercise[]): number {
  return Math.round(exercises.reduce((t, p) => t + plannedSeconds(p), 0) / 60);
}

/** Fractional sets per muscle per session past which the research has no data (spec step 9). */
const SESSION_HARD_CAP = 14;

/** Muscles with no weekly target: covered by compound lifts unless you add them yourself. */
const OPTIONAL_MUSCLES: Muscle[] = ['forearms', 'adductors', 'abductors', 'lowerBack'];
/**
 * Muscles that need less direct work: calves and abs are small, and front and rear delts get most of
 * theirs from presses and rows (spec step 17).
 */
const SMALL_MUSCLES: Muscle[] = ['calves', 'abs', 'frontDelts', 'rearDelts'];
const BIG_MUSCLES: Muscle[] = ['chest', 'lats', 'upperBack', 'quads', 'hamstrings', 'glutes'];

/** Fractional sets an exercise gives each muscle: 1 per primary set, 0.5 per synergist set. */
function credit(p: PlannedExercise): MuscleMap {
  const n = plannedWorkingSets(p).length;
  const out: MuscleMap = {};
  for (const m of p.exercise.secondary) out[m] = n * 0.5;
  for (const m of p.exercise.primary) out[m] = n;
  return out;
}

/** Adds one working set, keeping a max-effort set last. */
function withSetAdded(p: PlannedExercise): PlannedExercise {
  const sets = [...p.sets];
  let last = -1;
  for (let k = sets.length - 1; k >= 0; k--) if (!sets[k].isWarmup) { last = k; break; }
  if (last < 0) return p;
  sets.splice(last, 0, { ...sets[last], isAMRAP: false });
  return { ...p, sets };
}

function withSetRemoved(p: PlannedExercise): PlannedExercise {
  const sets = p.sets;
  let last = -1, firstWorking = -1;
  for (let k = sets.length - 1; k >= 0; k--) if (!sets[k].isWarmup) { last = k; break; }
  for (let k = 0; k < sets.length; k++) if (!sets[k].isWarmup) { firstWorking = k; break; }
  if (last < 0) return p;
  // Drop the second-to-last set so a max-effort last set survives.
  const drop = sets[last].isAMRAP && last > firstWorking ? last - 1 : last;
  return { ...p, sets: sets.filter((_, k) => k !== drop) };
}

/** An exercise picked for a slot, in the order it was added. */
interface Pick { slot: number; planned: PlannedExercise; order: number }

export class Planner {
  plan: UserPlan;
  gym: Gym;
  /** Newest first. */
  history: WorkoutRecord[];
  external: ExternalActivity[];
  overrides: RecoveryOverride[];
  catalog: Exercise[];

  constructor(args: {
    plan: UserPlan; gym: Gym; history: WorkoutRecord[]; external?: ExternalActivity[];
    overrides?: RecoveryOverride[]; catalog?: Exercise[];
  }) {
    this.plan = args.plan;
    this.gym = args.gym;
    this.history = [...args.history].sort((a, b) => b.date - a.date);
    this.external = args.external ?? [];
    this.overrides = args.overrides ?? [];
    this.catalog = args.catalog ?? Catalog.all;
  }

  private byID(): Map<string, Exercise> {
    return new Map(this.catalog.map((e) => [e.id, e]));
  }

  get scheme(): Scheme { return makeScheme(this.plan.goal, this.plan.experience); }
  get weeklySetTarget(): number { return this.scheme.weeklySetTarget; }

  /**
   * Builds today's workout (spec steps 17–25). The day's template lists slots in order; required
   * slots are filled first, then each muscle's sets grow toward its per-session target while time
   * allows, then muscles the day doesn't train (rear delts, abs, calves) fill any time left. The
   * session ends early rather than pile sets onto muscles that are already done.
   * Pass a different `seed` to regenerate; `focus` forces a day (swap menu).
   */
  generate(opts: { now?: number; seed?: number; focus?: DayFocus | null } = {}): PlannedWorkout {
    const now = opts.now ?? Date.now();
    const byID = this.byID();
    const recovery = computeRecovery({
      history: this.history, external: this.external, overrides: this.overrides, catalog: byID, now,
    });
    const [focus, targets] = opts.focus ? [opts.focus, this.targetMuscles(opts.focus, recovery)] as const : this.nextFocus(recovery);
    const weekly = this.weeklySetsBy(byID, now);
    const scheme = this.scheme;
    const level = this.plan.experience;

    // Per-muscle budgets (spec steps 8–11). Base: half the weekly target, more if the week is behind.
    const base: MuscleMap = {}, soft: MuscleMap = {}, priority: MuscleMap = {};
    for (const m of targets) {
      if (OPTIONAL_MUSCLES.includes(m)) continue;
      const size = SMALL_MUSCLES.includes(m) ? 0.6 : 1;
      const target = scheme.weeklySetTarget * size;
      const behind = Math.max(target / 2, target - (weekly[m] ?? 0));
      const fresh = (recovery[m] ?? 1) >= 0.4 ? 1 : 0.5;
      soft[m] = scheme.sessionSoftCap * size * fresh;
      base[m] = Math.min(soft[m], Math.max(scheme.sessionMin, Math.ceil(behind)) * fresh);
      const deficit = Math.max(0, 1 - (weekly[m] ?? 0) / target);
      priority[m] = (recovery[m] ?? 1) * (0.5 + deficit) * size;
    }

    const slots = templateFor(focus, targets);
    const rng = new SeededRandom(opts.seed ?? dayNumber(now));
    const budget = this.plan.sessionMinutes * 60;
    const supersets = this.plan.supersets;
    // Pairing saves rest, so with supersets on there's room for more work in the same time.
    const selectBudget = supersets ? budget * 1.4 : budget;
    const perMuscle = (m: Muscle) => (BIG_MUSCLES.includes(m) ? 3 : 2) - (level === 'beginner' ? 1 : 0);

    let picks: Pick[] = [];
    let order = 0;
    const filled = new Set<number>();
    const planned = (): MuscleMap => {
      const t: MuscleMap = {};
      for (const p of picks) for (const [m, v] of Object.entries(credit(p.planned))) t[m as Muscle] = (t[m as Muscle] ?? 0) + v;
      return t;
    };
    const seconds = () => picks.reduce((t, p) => t + plannedSeconds(p.planned), 0);
    const maxSets = (p: Pick) => scheme.maxSetsPerExercise - (slots[p.slot].main ? 0 : scheme.maxSetsPerExercise > 4 ? 1 : 0);
    const countFor = (m: Muscle) => picks.filter((p) => p.planned.exercise.primary.includes(m)).length;

    const fill = (i: number, exclude: Set<string> = new Set()): PlannedExercise | undefined => {
      const choice = this.pickFor(slots, i, picks, recovery, weekly, scheme, now, rng, exclude);
      if (!choice) { filled.add(i); return undefined; }
      return this.prescribeWith(choice.exercise, scheme, now, choice.reasons);
    };
    /** Whether a muscle couldn't grow because the session ran out of time (not out of options). */
    let outOfTime = false;
    const tryAdd = (i: number, force: boolean, exclude?: Set<string>): boolean => {
      const p = fill(i, exclude);
      if (!p) return false;
      if (!force && seconds() + plannedSeconds(p) > selectBudget) { outOfTime = true; return false; }
      picks.push({ slot: i, planned: p, order: order++ });
      filled.add(i);
      return true;
    };

    // 1. The first required slot for each muscle, so every muscle is covered even when time is short.
    const covered = new Set<Muscle>();
    slots.forEach((s, i) => {
      if (!s.required || s.extra || covered.has(s.muscle) || soft[s.muscle] === undefined) return;
      covered.add(s.muscle);
      tryAdd(i, picks.length < 3);
    });

    // 2. Grow each muscle toward its base, then its soft cap, while time allows.
    for (const goal of [base, soft]) {
      const blocked = new Set<Muscle>();
      outOfTime = false;
      for (let guard = 0; guard < 200; guard++) {
        const have = planned();
        let m: Muscle | undefined, worst = 0;
        for (const [k, g] of Object.entries(goal) as [Muscle, number][]) {
          const gap = (g - (have[k] ?? 0)) * (priority[k] ?? 0.5);
          if (!blocked.has(k) && g - (have[k] ?? 0) >= 0.5 && gap > worst) { m = k; worst = gap; }
        }
        if (!m) break;
        const open = slots.map((s, i) => i).filter((i) => !filled.has(i) && !slots[i].extra && slots[i].muscle === m);
        const requiredOpen = open.filter((i) => slots[i].required);
        const mine = picks.filter((p) => p.planned.exercise.primary.includes(m!) && plannedWorkingSets(p.planned).length < maxSets(p));
        const roomForAnother = countFor(m) < perMuscle(m) && picks.filter((p) => p.planned.exercise.primary.includes(m!))
          .every((p) => plannedWorkingSets(p.planned).length >= 3);
        // Growing one muscle mustn't push another (e.g. upper back from a second row) well past its cap.
        const overflows = (e: Exercise) => {
          const have = planned();
          return e.primary.some((k) => k !== m && soft[k] !== undefined && (have[k] ?? 0) > soft[k]! + 1);
        };
        let done = false;
        if (requiredOpen.length) done = tryAdd(requiredOpen[0], false);
        else if (open.length && (roomForAnother || !mine.length) && countFor(m) < perMuscle(m)) {
          // Try the next-best exercise if the best one would overload another muscle.
          const tried = new Set<string>();
          for (let attempt = 0; attempt < 4 && !done; attempt++) {
            filled.delete(open[0]);
            if (!tryAdd(open[0], false, tried)) break;
            const added = picks[picks.length - 1].planned.exercise;
            if (overflows(added)) { picks.pop(); filled.delete(open[0]); tried.add(added.id); } else done = true;
          }
          if (!done) filled.add(open[0]);
        }
        if (!done && mine.length && !requiredOpen.length) {
          const p = mine.sort((a, b) => plannedWorkingSets(a.planned).length - plannedWorkingSets(b.planned).length)[0];
          const bigger = withSetAdded(p.planned);
          const before = p.planned;
          if (seconds() - plannedSeconds(p.planned) + plannedSeconds(bigger) <= selectBudget) {
            p.planned = bigger;
            done = true;
            if (overflows(bigger.exercise)) { p.planned = before; done = false; }
          } else outOfTime = true;
        }
        if (!done) blocked.add(m);
      }
    }
    // Done: every muscle reached its cap or has nothing useful left to add (not merely out of time).
    const done = !outOfTime;

    // 3. Time left over: muscles the day doesn't otherwise train.
    // Skip an extra that would push a muscle past the hard ceiling.
    if (done) {
      slots.forEach((s, i) => {
        if (!s.extra || filled.has(i)) return;
        const before = picks.length;
        if (!tryAdd(i, false) || picks.length === before) return;
        const have = planned();
        if (picks[picks.length - 1].planned.exercise.primary.some((m) => (have[m] ?? 0) > SESSION_HARD_CAP)) picks.pop();
      });
    }

    // Make sure there's a workout at all.
    for (let i = 0; i < slots.length && picks.length < 3; i++) if (!filled.has(i)) tryAdd(i, true);

    // Template order, with extras last.
    picks.sort((a, b) => a.slot - b.slot);
    let chosen = picks.map((p) => p.planned);
    const addedOrder = new Map(picks.map((p) => [p.planned.exercise.id, p.order]));
    const lastAdded = (list: PlannedExercise[]) => list.reduce((best, p, i) =>
      (i > 0 && (best < 0 || (addedOrder.get(p.exercise.id) ?? 0) > (addedOrder.get(list[best].exercise.id) ?? 0)) ? i : best), -1);
    const total = (list: PlannedExercise[]) => list.reduce((t, p) => t + plannedSeconds(p), 0);

    if (supersets) {
      chosen = pairSupersets(chosen);
      // Selected against a looser budget: drop the most recently added until it fits.
      while (total(chosen) > budget && chosen.length > 3) {
        const i = lastAdded(chosen);
        if (i < 0) break;
        const [dropped] = chosen.splice(i, 1);
        if (dropped.supersetGroup) chosen = unpair(chosen, dropped.supersetGroup);
      }
    }

    // The 3-exercise minimum can overrun short sessions with long rests: trim sets until it fits.
    while (total(chosen) > budget) {
      let i = -1;
      for (let j = 0; j < chosen.length; j++) {
        if (i < 0 || plannedWorkingSets(chosen[j]).length > plannedWorkingSets(chosen[i]).length) i = j;
      }
      if (i < 0 || plannedWorkingSets(chosen[i]).length <= 2) break;
      chosen[i] = withSetRemoved(chosen[i]);
    }

    const minutes = Math.round(total(chosen) / 60);
    const note = done && minutes < this.plan.sessionMinutes - 10
      ? `Every muscle today has all the sets that help, so this runs about ${minutes} minutes instead of ${this.plan.sessionMinutes}.`
      : undefined;
    return {
      focus,
      targetMuscles: [...targets].sort((a, b) => (priority[b] ?? 0) - (priority[a] ?? 0)),
      exercises: chosen,
      estimatedMinutes: minutes,
      recovery,
      ...(note ? { note } : {}),
    };
  }

  // MARK: Single-exercise helpers for the app

  /** Sets, reps and weight for one exercise (swaps, or adding mid-workout). */
  prescribe(e: Exercise, now = Date.now()): PlannedExercise {
    return this.prescribeWith(e, this.scheme, now, []);
  }

  /** Eligible exercises that hit the same primary muscles, closest matches first. */
  alternatives(e: Exercise, excluding: Set<string> = new Set()): Exercise[] {
    const match = (x: Exercise) =>
      (x.pattern === e.pattern ? 2 : 0) + (x.isCompound === e.isCompound ? 1 : 0) + x.primary.filter((m) => e.primary.includes(m)).length;
    return this.catalog
      .filter((x) => x.id !== e.id && !excluding.has(x.id) && this.isEligible(x) && x.primary.some((m) => e.primary.includes(m)))
      // Don't offer a stretch as a swap for a lift, or the other way round.
      .filter((x) => (x.pattern === 'mobility') === (e.pattern === 'mobility'))
      .sort((a, b) => match(b) - match(a)
        || qualityScore(b, this.plan.goal, this.plan.experience, false) - qualityScore(a, this.plan.goal, this.plan.experience, false)
        || a.name.localeCompare(b.name));
  }

  /** Working sets per muscle over the last 7 days (secondary muscles count half). */
  weeklySets(now = Date.now()): MuscleMap {
    return this.weeklySetsBy(this.byID(), now);
  }

  private weeklySetsBy(byID: Map<string, Exercise>, now: number): MuscleMap {
    const sets: MuscleMap = {};
    for (const record of this.history) {
      if (now - record.date >= 7 * DAY_MS) continue;
      for (const logged of record.exercises) {
        const e = byID.get(logged.exerciseID);
        if (!e || e.pattern === 'mobility') continue;
        const n = workingSets(logged).length;
        for (const m of e.primary) sets[m] = (sets[m] ?? 0) + n;
        for (const m of e.secondary) sets[m] = (sets[m] ?? 0) + n * 0.5;
      }
    }
    return sets;
  }

  // MARK: Day selection

  /** Major muscle groups that are at least 80% recovered. */
  static freshGroupNames(recovery: MuscleMap): Muscle[][] {
    return FRESH_GROUPS.filter((g) => avg(recovery, g) >= 0.8);
  }

  nextFocus(recovery: MuscleMap): [DayFocus, Muscle[]] {
    let rotation: DayFocus[];
    switch (this.plan.split) {
      case 'pushPullLegs': rotation = ['push', 'pull', 'legs']; break;
      case 'upperLower': rotation = ['upper', 'lower']; break;
      case 'fullBody': rotation = ['fullBody']; break;
      case 'freshMuscles': return ['recovered', this.targetMuscles('recovered', recovery)];
    }
    let focus: DayFocus;
    const last = this.history.find((r) => r.focus && rotation.includes(r.focus))?.focus;
    if (last) {
      focus = rotation[(rotation.indexOf(last) + 1) % rotation.length];
    } else {
      // No history: start with the freshest day.
      focus = rotation.reduce((best, f) => (avg(recovery, focusMuscles(f)) > avg(recovery, focusMuscles(best)) ? f : best));
    }
    return [focus, this.targetMuscles(focus, recovery)];
  }

  targetMuscles(focus: DayFocus, recovery: MuscleMap): Muscle[] {
    if (focus !== 'recovered') return focusMuscles(focus);
    const top = [...FRESH_GROUPS].sort((a, b) => avg(recovery, b) - avg(recovery, a)).slice(0, 2);
    return [...new Set(top.flat())];
  }

  // MARK: Exercise selection

  isEligible(e: Exercise): boolean {
    if (!e.equipment.every((eq) => this.gym.equipment.includes(eq))) return false;
    if (this.plan.preferences[e.id] === 'exclude') return false;
    if (e.jointsStressed.some((j) => this.plan.injuries.includes(j))) return false;
    return levelRank(e.level) <= levelRank(this.plan.experience) + 1;
  }

  /** The best exercise for slot `i` (spec steps 18–21), or undefined if nothing fits. */
  private pickFor(slots: Slot[], i: number, picks: Pick[], recovery: MuscleMap, weekly: MuscleMap, scheme: Scheme,
                  now: number, rng: SeededRandom, exclude: Set<string> = new Set()): { exercise: Exercise; reasons: string[] } | undefined {
    const slot = slots[i];
    const goal = this.plan.goal;
    const strengthGoal = goal === 'getStronger' || goal === 'powerlifting';
    const key = tierKey(goal, !!slot.main);
    const taken = new Set(picks.map((p) => p.planned.exercise.id));
    const avoid = slot.differentFrom !== undefined
      ? picks.find((p) => p.slot === slot.differentFrom)?.planned.exercise : undefined;
    const avoidRole = avoid ? qualityOf(avoid).roles[0] : undefined;
    const heavy = picks.some((p) => qualityOf(p.planned.exercise).fatigue >= 4);

    const candidates = this.catalog.filter((e) => {
      if (taken.has(e.id) || exclude.has(e.id) || e.pattern === 'mobility' || !this.isEligible(e)) return false;
      const qv = qualityOf(e);
      return qv.roles.some((r) => slot.roles.includes(r)) && qv.roles[0] !== avoidRole;
    });
    // C-tier only when it's all there is for a required slot, or you asked for it.
    const good = candidates.filter((e) => qualityOf(e).tiers[key] !== 'C' || this.plan.preferences[e.id] === 'more');
    const pool = good.length ? good : slot.required ? candidates : [];

    let best: { exercise: Exercise; score: number } | undefined;
    for (const e of pool) {
      const qv = qualityOf(e);
      let score = qualityScore(e, goal, this.plan.experience, !!slot.main);
      // Prefer roles in the order the slot lists them (e.g. a long-length curl before any curl).
      score -= 6 * Math.max(0, slot.roles.indexOf(qv.roles.find((r) => slot.roles.includes(r))!));
      if (levelRank(e.level) > levelRank(this.plan.experience)) score -= 10;
      if (e.primary.some((m) => (recovery[m] ?? 1) < 0.4)) score -= 20;
      // Size goals: one very fatiguing lift per session is plenty.
      if (!strengthGoal && heavy && qv.fatigue >= 4) score -= 40;

      const pref = this.plan.preferences[e.id];
      if (pref === 'more') score += 25;
      else if (pref === 'less') score -= 25;

      const lastDone = this.history.find((r) => r.exercises.some((x) => x.exerciseID === e.id));
      const daysSince = lastDone ? (now - lastDone.date) / DAY_MS : undefined;
      // Keep main lifts stable so they can progress.
      if (slot.main && daysSince !== undefined && daysSince < 21) score += 15;
      switch (this.plan.variability) {
        case 'consistent': if (daysSince !== undefined && daysSince < 21) score += 12; break;
        case 'balanced': if (daysSince !== undefined) score += daysSince < 3 ? -8 : daysSince < 21 ? 5 : 0; break;
        case 'variable':
          if (daysSince !== undefined && daysSince < 7) score -= 15;
          else if (daysSince === undefined) score += 6;
          break;
      }
      const noise = this.plan.variability === 'consistent' ? 2 : this.plan.variability === 'balanced' ? 6 : 12;
      score += rng.next(-noise, noise);
      if (score > (best?.score ?? -Infinity)) best = { exercise: e, score };
    }
    if (!best) return undefined;

    const e = best.exercise;
    const reasons: string[] = [];
    const lead = e.primary.includes(slot.muscle) ? slot.muscle : e.primary[0];
    if (lead) {
      reasons.push(`${muscleName(lead)} ${Math.round((recovery[lead] ?? 1) * 100)}% recovered · `
        + `${Math.round(weekly[lead] ?? 0)}/${Math.trunc(scheme.weeklySetTarget)} sets this week`);
    }
    if (slot.extra) reasons.push('Time to spare: a muscle today\'s plan doesn\'t otherwise train');
    else if (slot.main && strengthGoal) reasons.push('Main lift for your strength goal');
    else if (qualityOf(e).longLength >= 5 && !strengthGoal) reasons.push('Works the muscle in a stretched position, which builds more size');
    if (this.plan.preferences[e.id] === 'more') reasons.push('You asked to see this more');
    return { exercise: e, reasons };
  }

  // MARK: Prescription

  prescribeWith(e: Exercise, scheme: Scheme, now: number, baseReasons: string[]): PlannedExercise {
    const reasons = [...baseReasons];
    const past: LoggedExercise[] = [];
    for (const r of this.history) {
      const l = r.exercises.find((x) => x.exerciseID === e.id);
      if (l) past.push(l);
    }
    const sessions = past.length;
    const range = e.isCompound ? scheme.compoundReps : scheme.isolationReps;
    // Undulate heavy → medium → light across sessions of the same exercise.
    const wave = [0, 0.5, 1][sessions % 3];
    let reps = range[0] + Math.round((range[1] - range[0]) * wave);
    const setCount = scheme.sets + (e.isCompound ? scheme.compoundExtraSets : 0);
    const rest = e.isCompound ? scheme.restCompound : scheme.restIsolation;
    const maxEffort = e.isCompound && !e.isTimed && sessions > 0 && (sessions + 1) % 6 === 0;
    if (maxEffort) reasons.push('Max effort: go to failure on the last set');

    if (e.isTimed) {
      const best = bestReps(e.id, this.history, now);
      const seconds = best !== undefined ? Math.min(best + 5, 120) : 30;
      // Loaded holds and carries: reuse the last weight, else a moderate share of the starter 1RM.
      const lastWeights = past[0] ? workingSets(past[0]).map((s) => s.weight) : [];
      const lastWeight = lastWeights.length ? Math.max(...lastWeights) : undefined;
      const weight = isBodyweight(e) ? null : this.round(lastWeight ?? this.startingOneRM(e, now) * 0.6, e);
      const n = Math.max(2, setCount - 1);
      const sets = Array.from({ length: n }, () => ({ weight, reps: seconds, isWarmup: false, isAMRAP: false }));
      return { exercise: e, sets, restSeconds: 60, targetRIR: scheme.rir, reasons };
    }

    let weight: number | null = null;
    if (isBodyweight(e)) {
      const best = bestReps(e.id, this.history, now);
      if (best !== undefined) {
        reps = Math.min(best + 1, 30);
        reasons.push(`Best set lately: ${best} reps`);
      } else {
        reps = Math.max(range[0], 8);
      }
    } else {
      let oneRM: number;
      const known = estimatedOneRM(e.id, this.history, now);
      if (known !== undefined) {
        oneRM = known;
        const last = past[0];
        const target = last?.targetReps;
        if (last && target != null && straightSets(last).length) {
          const hit = straightSets(last).every((s) => s.reps >= target && (s.rir ?? scheme.rir) >= scheme.rir);
          const missed = (l: LoggedExercise) => straightSets(l).some((s) => s.reps < target - 1);
          if (hit) {
            oneRM += this.progressionBump(e);
            reasons.push('Hit every rep last time, adding weight');
          } else if (past.length >= 2 && missed(past[0]) && missed(past[1])) {
            oneRM *= 0.95;
            reasons.push('Missed reps twice, backing off 5%');
          }
        }
        const lastDate = this.history.find((r) => r.exercises.some((x) => x.exerciseID === e.id))?.date;
        if (lastDate !== undefined && now - lastDate > 14 * DAY_MS) reasons.push('Easing back in after time off');
      } else {
        oneRM = this.startingOneRM(e, now);
        reasons.push('New exercise: starting light, adjust to feel');
      }
      weight = this.round(weightForReps(reps, scheme.rir, oneRM), e);
    }

    const sets: PlannedSet[] = [];
    if (this.plan.warmUpSets && e.isCompound && weight !== null) sets.push(...this.warmups(weight, reps, e));
    for (let i = 0; i < setCount; i++) {
      sets.push({ weight, reps, isWarmup: false, isAMRAP: maxEffort && i === setCount - 1 });
    }
    return { exercise: e, sets, restSeconds: rest, targetRIR: scheme.rir, reasons };
  }

  progressionBump(e: Exercise): number {
    const eq = loadEquipment(e);
    // One loadable step in working weight is ~1.15x that step in e1RM at moderate reps.
    return eq ? gymIncrementKg(this.gym, eq) * 1.15 : 0;
  }

  round(weight: number, e: Exercise): number {
    const eq = loadEquipment(e);
    return eq ? gymRound(this.gym, weight, eq) : weight;
  }

  /** No history for this lift: scale from a related lift you have done, else a conservative default. */
  startingOneRM(e: Exercise, now: number): number {
    const related = this.catalog.filter((r) =>
      r.id !== e.id && r.pattern === e.pattern && !isBodyweight(r) && r.primary.some((m) => e.primary.includes(m)));
    for (const r of related) {
      const known = estimatedOneRM(r.id, this.history, now);
      if (known !== undefined) return known * e.starterOneRM / r.starterOneRM * 0.9;
    }
    const level = this.plan.experience === 'beginner' ? 0.6 : this.plan.experience === 'intermediate' ? 0.85 : 1.2;
    return e.starterOneRM * level;
  }

  warmups(top: number, reps: number, e: Exercise): PlannedSet[] {
    const eq = loadEquipment(e);
    const base = eq ? gymBaseLoadKg(this.gym, eq) : 0;
    if (top < Math.max(40, base * 2)) return [];
    const steps: [number, number][] = [[0.5, 8], [0.7, 5]];
    if (reps <= 6) steps.push([0.85, 2]);
    const seen = new Set<number>();
    const out: PlannedSet[] = [];
    for (const [pct, r] of steps) {
      const w = this.round(top * pct, e);
      if (w >= top || seen.has(w)) continue;
      seen.add(w);
      out.push({ weight: w, reps: r, isWarmup: true, isAMRAP: false });
    }
    return out;
  }

  /** Warm-up ramp to a working weight, for program sessions. */
  warmupSets(top: number, reps: number, exercise: Exercise): PlannedSet[] {
    return this.plan.warmUpSets && exercise.isCompound ? this.warmups(top, reps, exercise) : [];
  }
}

export { epley as oneRMEstimate };

import { Catalog } from './catalog';
import {
  type DayFocus, type Exercise, type ExternalActivity, type Goal, type Gym, type Level, type LoadKind, type LoggedExercise,
  type LoggedSet, type Muscle, type MuscleMap, type RecoveryOverride, type UserPlan, type WorkoutRecord,
  type Need, DAY_MS, focusMuscles, gymBaseLoadKg, provides, gymIncrementKg, gymRound, isBodyweight, levelRank, loadEquipment, muscleName,
  straightSets, workingSets,
} from './models';
import { type BlockCheckIns, type BlockStatus, blockRIR, blockStatus, deloadDates } from './block';
import { qualityOf, qualityScore, tierKey } from './quality';
import { computeRecovery } from './recovery';
import { type Slot, templateFor } from './templates';
import { MAX_PLAUSIBLE_KG, bestReps, estimatedOneRM, oneRM as epley, plausibleLoad, setRIR, weightForReps } from './strength';

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
  /** Where this workout sits in the current training block. */
  block?: BlockStatus;
  /** Muscles the day trains that no eligible exercise works directly (equipment, injuries, exclusions). */
  uncovered?: Muscle[];
  /** Nothing the day could train is well recovered yet (Fresh Muscles). */
  fatigued?: boolean;
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
  // Strength goals allow more sets of a main lift, but the beginner cap of 3 still holds.
  if ((goal === 'getStronger' || goal === 'powerlifting') && experience !== 'beginner') s.maxSetsPerExercise = 5;
  return s;
}

// MARK: - Deterministic randomness

const MASK = (1n << 64n) - 1n;

/** SplitMix64, so the same seed regenerates the same workout. */
export class SeededRandom {
  private state: bigint;
  constructor(seed: number | bigint) {
    // BigInt() throws on fractions, NaN and Infinity; a corrupted saved seed shouldn't crash Today.
    const n = typeof seed === 'bigint' ? seed : BigInt(Number.isFinite(seed) ? Math.trunc(seed) : 0);
    this.state = (n + 0x9E3779B97F4A7C15n) & MASK;
  }

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

/**
 * Breaks a pair up again (its partner was dropped), giving the one left the scheme's normal rest for
 * its kind of exercise (the paired rests were 30 s, or the partner's).
 */
export function unpair(list: PlannedExercise[], group: string, scheme: { restCompound: number; restIsolation: number }): PlannedExercise[] {
  return list.map((p) => {
    if (p.supersetGroup !== group) return p;
    const { supersetGroup: _, ...rest } = p;
    return { ...rest, restSeconds: p.exercise.isCompound ? scheme.restCompound : scheme.restIsolation };
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

/**
 * The weight most straight sets were done at (the heavier on a tie), with those sets. Double
 * progression judges these, so a heavy single or a light back-off set doesn't mix one set's weight with
 * another's reps. Undefined when no set had a believable load.
 */
export function workingLoad(l: LoggedExercise): { load: number; sets: LoggedSet[] } | undefined {
  const groups = new Map<number, LoggedSet[]>();
  for (const s of straightSets(l)) {
    if (!plausibleLoad(s.weight)) continue;
    const key = Math.round(s.weight * 100) / 100;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  let best: { load: number; sets: LoggedSet[] } | undefined;
  for (const [load, sets] of groups) {
    if (!best || sets.length > best.sets.length || (sets.length === best.sets.length && load > best.load)) best = { load, sets };
  }
  return best;
}

/** Prescriptions whose empty bar is well over the planned load; generate() tries something else first. */
const overBar = new WeakSet<PlannedExercise>();

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

/** Whether an accessory makes way for another at the start of block `n` (about one in four). */
function rotates(id: string, n: number): boolean {
  let h = n * 2654435761;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 4) === 0;
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
  /** End-of-block check-in answers, which can stretch a block or bring its deload forward. */
  checkIns?: BlockCheckIns;

  constructor(args: {
    plan: UserPlan; gym: Gym; history: WorkoutRecord[]; external?: ExternalActivity[];
    overrides?: RecoveryOverride[]; catalog?: Exercise[]; checkIns?: BlockCheckIns;
  }) {
    this.plan = args.plan;
    this.checkIns = args.checkIns;
    this.gym = args.gym;
    this.source = args.history;
    this.history = [...args.history].sort((a, b) => b.date - a.date);
    this.external = args.external ?? [];
    this.overrides = args.overrides ?? [];
    this.catalog = args.catalog ?? Catalog.all;
  }

  private _provided?: Set<Need>;
  /** What this gym's equipment lets you do (any bench, a high pulley, ...). */
  get provided(): Set<Need> { return (this._provided ??= provides(this.gym.equipment)); }

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
    const now = Number.isFinite(opts.now) ? opts.now! : Date.now();
    return this.asOf(now, () => this.generateAt(now, opts));
  }

  /**
   * Runs `fn` with records dated after `now` hidden: a wrong clock or an edited or imported date
   * mustn't count toward this week's sets, the day rotation or "last done".
   */
  private asOf<T>(now: number, fn: () => T): T {
    if (!(this.history[0]?.date > now)) return fn();
    const full = this.history;
    this.history = full.filter((r) => r.date <= now);
    try { return fn(); } finally { this.history = full; }
  }

  private generateAt(now: number, opts: { seed?: number; focus?: DayFocus | null }): PlannedWorkout {
    const byID = this.byID();
    const recovery = computeRecovery({
      history: this.history, external: this.external, overrides: this.overrides, catalog: byID, now,
    });
    const [focus, targets] = opts.focus ? [opts.focus, this.targetMuscles(opts.focus, recovery)] as const : this.nextFocus(recovery);
    const weekly = this.weeklySetsBy(byID, now);
    const scheme = this.scheme;
    const level = this.plan.experience;
    const block = blockStatus(this.history, now, this.checkIns);
    // Deload (spec step 34): about 40% fewer sets, same exercises, easy effort.
    const volume = block.isDeload ? 0.6 : 1;

    // Per-muscle budgets (spec steps 8–11). Base: half the weekly target, more if the week is behind.
    const base: MuscleMap = {}, soft: MuscleMap = {}, priority: MuscleMap = {};
    for (const m of targets) {
      if (OPTIONAL_MUSCLES.includes(m)) continue;
      const size = SMALL_MUSCLES.includes(m) ? 0.6 : 1;
      const target = scheme.weeklySetTarget * size;
      const behind = Math.max(target / 2, target - (weekly[m] ?? 0));
      const fresh = (recovery[m] ?? 1) >= 0.4 ? 1 : 0.5;
      soft[m] = scheme.sessionSoftCap * size * fresh * volume;
      base[m] = Math.min(soft[m], Math.max(scheme.sessionMin, Math.ceil(behind * volume)) * fresh);
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
    const maxSets = (p: Pick) => block.isDeload ? 3
      : scheme.maxSetsPerExercise - (slots[p.slot].main ? 0 : scheme.maxSetsPerExercise > 4 ? 1 : 0);
    const countFor = (m: Muscle) => picks.filter((p) => p.planned.exercise.primary.includes(m)).length;

    const fill = (i: number, exclude: Set<string> = new Set()): PlannedExercise | undefined => {
      let first: PlannedExercise | undefined;
      const skip = new Set(exclude);
      // An empty bar much heavier than the planned load is a poor pick: try a lighter-loading one first.
      for (let attempt = 0; attempt < 4; attempt++) {
        const choice = this.pickFor(slots, i, picks, recovery, weekly, scheme, now, rng, block, skip);
        if (!choice) break;
        const p = this.prescribeWith(choice.exercise, scheme, now, choice.reasons, { main: !!slots[i].main, block });
        if (!overBar.has(p)) return p;
        first ??= p;
        skip.add(choice.exercise.id);
      }
      if (!first) filled.add(i);
      return first;
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

    // 3. Time left over: muscles the day doesn't otherwise train (not on a deload).
    // Skip an extra that would push a muscle past the hard ceiling.
    if (done && !block.isDeload) {
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
        if (dropped.supersetGroup) chosen = unpair(chosen, dropped.supersetGroup, scheme);
      }
    }

    // The 3-exercise minimum can overrun short sessions with long rests. Trim until it fits, gentlest
    // cut first: sets down to 2, warm-ups on everything but the main lift, then whole exercises down to
    // two, then the main lift's warm-ups, then sets down to 1, then down to one exercise.
    const trimSets = (floor: number) => {
      while (total(chosen) > budget) {
        let i = -1;
        for (let j = 0; j < chosen.length; j++) {
          if (i < 0 || plannedWorkingSets(chosen[j]).length > plannedWorkingSets(chosen[i]).length) i = j;
        }
        if (i < 0 || plannedWorkingSets(chosen[i]).length <= floor) return;
        chosen[i] = withSetRemoved(chosen[i]);
      }
    };
    const dropWarmups = (from: number) => {
      for (let i = chosen.length - 1; i >= from && total(chosen) > budget; i--) {
        if (chosen[i].sets.some((s) => s.isWarmup)) chosen[i] = { ...chosen[i], sets: chosen[i].sets.filter((s) => !s.isWarmup) };
      }
    };
    const dropExercises = (floor: number) => {
      while (total(chosen) > budget && chosen.length > floor) {
        const i = lastAdded(chosen);
        if (i < 0) return;
        const [dropped] = chosen.splice(i, 1);
        if (dropped.supersetGroup) chosen = unpair(chosen, dropped.supersetGroup, scheme);
      }
    };
    trimSets(2);
    dropWarmups(1);
    dropExercises(2);
    dropWarmups(0);
    trimSets(1);
    dropExercises(1);

    // Muscles the day trains that nothing eligible works directly: say so rather than call the day complete.
    const direct = new Set(chosen.flatMap((p) => p.exercise.primary));
    const options = new Set(this.catalog.filter((e) => e.pattern !== 'mobility' && this.isEligible(e)).flatMap((e) => e.primary));
    const uncovered = targets.filter((m) => base[m] !== undefined && !direct.has(m) && !options.has(m));
    // Fresh Muscles picks the two freshest groups even when none of them has recovered.
    const fatigued = focus === 'recovered' && !FRESH_GROUPS.some((g) => avg(recovery, g) >= 0.5);

    const minutes = Math.round(total(chosen) / 60);
    const names = (ms: Muscle[]) => {
      const n = ms.map(muscleName);
      return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0];
    };
    const notes: string[] = [];
    if (block.isDeload) {
      notes.push(`Deload week: fewer sets and easier effort so you recover. ${block.earlyReason ? `${block.earlyReason}, so it came early. ` : ''}Next week starts a new block.`);
    }
    if (!chosen.length) {
      notes.push('No exercise for today fits this gym\'s equipment and your settings (injuries and excluded exercises). Try another day, or add equipment or exercises.');
    } else if (uncovered.length) {
      notes.push(`Nothing for ${names(uncovered)} fits this gym's equipment and your settings, so ${uncovered.length > 1 ? 'they get' : 'it gets'} no direct work today.`);
    } else if (!block.isDeload && done && minutes < this.plan.sessionMinutes - 10) {
      notes.push(`Every muscle today has all the sets that help, so this runs about ${minutes} minutes instead of ${this.plan.sessionMinutes}.`);
    }
    if (fatigued) notes.push('Nothing is well recovered yet: a rest day or easy mobility work may serve you better. If you train, keep it easy.');
    if (total(chosen) > budget) {
      notes.push(`Even trimmed to the essentials, this runs about ${minutes} minutes, over your ${this.plan.sessionMinutes}.`);
    }
    const note = notes.join(' ');
    return {
      focus,
      targetMuscles: [...targets].sort((a, b) => (priority[b] ?? 0) - (priority[a] ?? 0)),
      exercises: chosen,
      estimatedMinutes: minutes,
      recovery,
      block,
      ...(note ? { note } : {}),
      ...(uncovered.length || !chosen.length ? { uncovered: chosen.length ? uncovered : targets.filter((m) => base[m] !== undefined) } : {}),
      ...(fatigued ? { fatigued } : {}),
    };
  }

  // MARK: Single-exercise helpers for the app

  /** Sets, reps and weight for one exercise (swaps, or adding mid-workout). */
  prescribe(e: Exercise, now = Date.now()): PlannedExercise {
    return this.asOf(now, () => this.prescribeWith(e, this.scheme, now, [], { block: blockStatus(this.history, now, this.checkIns) }));
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
      const age = now - record.date;
      if (age < 0 || age >= 7 * DAY_MS) continue;
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
    if (!e.equipment.every((n) => this.provided.has(n))) return false;
    if (this.plan.preferences[e.id] === 'exclude') return false;
    if (e.jointsStressed.some((j) => this.plan.injuries.includes(j))) return false;
    return levelRank(e.level) <= levelRank(this.plan.experience) + 1;
  }

  /** The best exercise for slot `i` (spec steps 18–21), or undefined if nothing fits. */
  private pickFor(slots: Slot[], i: number, picks: Pick[], recovery: MuscleMap, weekly: MuscleMap, scheme: Scheme,
                  now: number, rng: SeededRandom, block: BlockStatus,
                  exclude: Set<string> = new Set()): { exercise: Exercise; reasons: string[] } | undefined {
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
    let pool = good.length ? good : slot.required ? candidates : [];
    // Nothing in the slot's roles fits (no equipment, injuries): any eligible exercise that works the
    // slot's muscle directly beats leaving it untrained, e.g. a close-grip push-up for triceps.
    // Optional slots keep the C-tier rule.
    const fallback = !candidates.length && !slot.extra;
    if (fallback) {
      pool = this.catalog.filter((e) => !taken.has(e.id) && !exclude.has(e.id) && e.pattern !== 'mobility'
        && this.isEligible(e) && e.primary.includes(slot.muscle)
        && (slot.required || qualityOf(e).tiers[key] !== 'C' || this.plan.preferences[e.id] === 'more'));
    }

    let best: { exercise: Exercise; score: number } | undefined;
    for (const e of pool) {
      const qv = qualityOf(e);
      let score = qualityScore(e, goal, this.plan.experience, !!slot.main);
      // Prefer roles in the order the slot lists them (e.g. a long-length curl before any curl).
      const role = qv.roles.find((r) => slot.roles.includes(r));
      if (role) score -= 6 * Math.max(0, slot.roles.indexOf(role));
      // Fallback picks: an exercise whose first muscle is the slot's beats one that only includes it.
      else if (e.primary[0] !== slot.muscle) score -= 10;
      if (levelRank(e.level) > levelRank(this.plan.experience)) score -= 10;
      if (e.primary.some((m) => (recovery[m] ?? 1) < 0.4)) score -= 20;
      // Size goals: one very fatiguing lift per session is plenty.
      if (!strengthGoal && heavy && qv.fatigue >= 4) score -= 40;

      const pref = this.plan.preferences[e.id];
      if (pref === 'more') score += 25;
      else if (pref === 'less') score -= 25;

      const lastDone = this.history.find((r) => r.exercises.some((x) => x.exerciseID === e.id));
      const daysSince = lastDone ? (now - lastDone.date) / DAY_MS : undefined;
      // Spec step 35: keep exercises steady within a block so they can progress, and rotate some
      // accessories when a new block starts. Main lifts stay put whatever your variety setting.
      const inBlock = !!lastDone && lastDone.date >= block.startedAt;
      const lastBlock = !inBlock && daysSince !== undefined && daysSince < 56;
      if (slot.main && (inBlock || lastBlock)) score += 30;
      switch (this.plan.variability) {
        case 'consistent': if (inBlock || lastBlock) score += 25; break;
        case 'balanced':
          if (inBlock) score += 20;
          // About a quarter of last block's accessories make way for something new.
          else if (lastBlock && !slot.main && rotates(e.id, block.number)) score -= 25;
          else if (lastBlock) score += 10;
          break;
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
    if (fallback) {
      const muscle = muscleName(slot.muscle).toLowerCase();
      // Another exercise already trains this muscle (the main lift fit), so "nothing fits" would be wrong.
      const covered = picks.some((p) => p.planned.exercise.primary.includes(slot.muscle));
      reasons.push(covered
        ? `More ${muscle} work with the equipment you have`
        : `Nothing usual for ${muscle} fits your equipment: this works it with what you have`);
    }
    if (slot.extra) reasons.push('Time to spare: a muscle today\'s plan doesn\'t otherwise train');
    else if (slot.main && strengthGoal) reasons.push('Main lift for your strength goal');
    else if (qualityOf(e).longLength >= 5 && !strengthGoal) reasons.push('Works the muscle in a stretched position, which builds more size');
    if (this.plan.preferences[e.id] === 'more') reasons.push('You asked to see this more');
    const usedBefore = this.history.some((r) => r.date < block.startedAt && r.exercises.some((x) => x.exerciseID === e.id));
    const usedInBlock = this.history.some((r) => r.date >= block.startedAt && r.exercises.some((x) => x.exerciseID === e.id));
    if (!usedInBlock && !usedBefore && this.history.length && block.week === 1 && !slot.main
        && this.plan.variability === 'balanced') reasons.push('New block: a fresh exercise for this muscle');
    return { exercise: e, reasons };
  }

  // MARK: Prescription

  /**
   * Sets, reps, load and effort for one exercise (spec steps 29–32):
   * - Effort follows the training block: reps in reserve drop week by week, and deloads stay easy.
   * - Main lifts for strength goals load from your estimated max, waving heavy → medium → light across
   *   sessions (beginners stay heavy and add weight each time).
   * - Everything else uses double progression: same weight until every set reaches the top of the rep
   *   range, then add one step and start again at the bottom.
   */
  prescribeWith(e: Exercise, scheme: Scheme, now: number, baseReasons: string[],
                ctx: { main?: boolean; block?: BlockStatus } = {}): PlannedExercise {
    const reasons = [...baseReasons];
    const block = ctx.block ?? blockStatus(this.history, now, this.checkIns);
    const strengthGoal = this.plan.goal === 'getStronger' || this.plan.goal === 'powerlifting';
    const main = ctx.main ?? (e.isCompound && qualityOf(e).strengthTransfer >= 4);
    const loadFromMax = strengthGoal && main;
    const rir = blockRIR(this.plan.goal, this.plan.experience, block, e.isCompound);
    const past: LoggedExercise[] = [];
    /** Sessions outside deload weeks: a deload's lighter loads aren't something to progress from. */
    const training: LoggedExercise[] = [];
    for (const r of this.history) {
      const l = r.exercises.find((x) => x.exerciseID === e.id);
      if (!l) continue;
      past.push(l);
      if (!this.wasDeload(r.date)) training.push(l);
    }
    const sessions = past.length;
    const range = e.isCompound ? scheme.compoundReps : scheme.isolationReps;
    let reps = range[0];
    const fullSets = scheme.sets + (e.isCompound ? scheme.compoundExtraSets : 0);
    const setCount = block.isDeload ? Math.max(2, Math.round(fullSets * 0.6)) : fullSets;
    const rest = e.isCompound ? scheme.restCompound : scheme.restIsolation;
    const maxEffort = loadFromMax && !block.isDeload && !e.isTimed && sessions > 0 && (sessions + 1) % 6 === 0;
    if (maxEffort) reasons.push('Max effort: go to failure on the last set');
    if (block.isDeload) reasons.push('Deload: lighter and easier, stop well short of failure');

    if (e.isTimed) {
      const best = bestReps(e.id, this.history, now);
      const seconds = best !== undefined ? Math.min(best + (block.isDeload ? -5 : 5), 120) : 30;
      // Loaded holds and carries: reuse the last weight, else a moderate share of the starter 1RM.
      // A logged 0 (or a typo) isn't a weight to repeat.
      const lastWeights = past[0] ? workingSets(past[0]).map((s) => s.weight).filter(plausibleLoad) : [];
      const lastWeight = lastWeights.length ? Math.max(...lastWeights) : undefined;
      const weight = isBodyweight(e) ? null : this.round(lastWeight ?? this.startingOneRM(e, now) * 0.6, e);
      const n = Math.max(2, setCount - 1);
      const sets = Array.from({ length: n }, () => ({ weight, reps: Math.max(10, seconds), isWarmup: false, isAMRAP: false }));
      return { exercise: e, sets, restSeconds: 60, targetRIR: rir, reasons };
    }

    let weight: number | null = null;
    /** The load the numbers asked for, before rounding to something loadable. */
    let intended: number | undefined;
    const lastDate = this.history.find((r) => r.exercises.some((x) => x.exerciseID === e.id))?.date;
    const away = lastDate !== undefined && now - lastDate > 14 * DAY_MS;
    if (isBodyweight(e)) {
      const best = bestReps(e.id, this.history, now);
      if (best !== undefined) {
        reps = block.isDeload ? Math.max(5, Math.round(best * 0.7)) : Math.min(best + 1, 30);
        reasons.push(`Best set lately: ${best} reps`);
      } else {
        reps = Math.max(range[0], 8);
      }
    } else if (loadFromMax) {
      // Daily undulation for trained lifters; beginners progress the same rep target every session.
      // A deload sits on the middle of the wave so its heaviest day can't be the block's heaviest load.
      const wave = this.plan.experience === 'beginner' ? 0 : block.isDeload ? 0.5 : [0, 0.5, 1][sessions % 3];
      reps = range[0] + Math.round((range[1] - range[0]) * wave);
      let oneRM: number;
      const known = estimatedOneRM(e.id, this.history, now);
      if (known !== undefined) {
        oneRM = known;
        const last = training[0];
        const target = last?.targetReps;
        if (last && target != null && straightSets(last).length && !block.isDeload) {
          // An unrated set counts as done at the prescribed effort, not as a set to failure.
          const hit = straightSets(last).every((s) => s.reps >= target && setRIR(s, last.targetRIR) >= (last.targetRIR ?? 0));
          const missed = (l: LoggedExercise) => straightSets(l).some((s) => s.reps < target - 1);
          if (hit) {
            oneRM += this.progressionBump(e);
            reasons.push('Hit every rep last time, adding weight');
          } else if (training.length >= 2 && missed(training[0]) && missed(training[1])) {
            oneRM *= 0.95;
            reasons.push('Missed reps twice, backing off 5%');
          }
        }
        if (away) reasons.push('Easing back in after time off');
      } else {
        oneRM = this.startingOneRM(e, now);
        reasons.push('New exercise: starting light, adjust to feel');
      }
      intended = weightForReps(reps, rir, oneRM);
      weight = this.round(intended, e);
      if (block.isDeload) {
        // Lighter than the last training session, whatever the estimate says.
        const lastTop = training[0] ? workingLoad(training[0])?.load : undefined;
        if (lastTop !== undefined) weight = Math.min(weight, this.lighter(lastTop, e));
      }
    } else {
      const last = training[0];
      const top = last ? workingLoad(last) : undefined;
      if (!top || away) {
        const known = estimatedOneRM(e.id, this.history, now);
        intended = weightForReps(reps, rir, known ?? this.startingOneRM(e, now));
        weight = this.round(intended, e);
        reasons.push(known !== undefined ? (away ? 'Easing back in after time off' : 'From your recent sets')
          : past.some((l) => workingSets(l).length) ? 'No weight logged last time: starting light, adjust to feel'
            : 'New exercise: starting light, adjust to feel');
      } else {
        // Judge the weight most sets were done at, and only those sets: a heavier single or a light
        // back-off set says little about what you can do for the planned reps.
        const lastLoad = top.load;
        const minReps = Math.min(...top.sets.map((s) => s.reps));
        const step = this.progressionStep(e);
        const missed = (l: LoggedExercise) => (workingLoad(l)?.sets ?? []).some((s) => s.reps < range[0]);
        if (block.isDeload) {
          weight = this.lighter(lastLoad, e);
        } else if (training.length >= 2 && missed(training[0]) && missed(training[1])) {
          weight = this.round(lastLoad * 0.95, e);
          reasons.push('Missed reps twice, backing off 5%');
        } else if (minReps >= range[1]) {
          // A step over ~7.5% of the load (light dumbbells, cable pins) is too big: add reps first.
          const extendedTop = range[1] + 3;
          if (step > lastLoad * 0.075 && minReps < extendedTop) {
            weight = this.round(lastLoad, e);
            reps = extendedTop;
            reasons.push(`The next weight is a big jump: build to ${extendedTop} reps first`);
          } else {
            weight = this.round(lastLoad + step, e);
            reasons.push('Hit the top of the range on every set, adding weight');
          }
        } else {
          weight = this.round(lastLoad, e);
          reps = Math.min(range[1], Math.max(range[0], minReps + 1));
          reasons.push(`Same weight: aim for ${reps} reps on every set`);
        }
      }
    }

    // The empty bar is the lightest this lift can be loaded: say so when that's well over the plan.
    const kind = this.loadKind(e);
    const bar = kind ? gymBaseLoadKg(this.gym, kind) : 0;
    const heavyBar = intended !== undefined && bar > 0 && intended < bar * 0.85;
    if (heavyBar) reasons.push('The empty bar is heavier than planned: do fewer reps, or swap for a dumbbell version');

    const sets: PlannedSet[] = [];
    if (this.plan.warmUpSets && e.isCompound && weight !== null) sets.push(...this.warmups(weight, reps, e));
    for (let i = 0; i < setCount; i++) {
      sets.push({ weight, reps, isWarmup: false, isAMRAP: maxEffort && i === setCount - 1 });
    }
    const out: PlannedExercise = { exercise: e, sets, restSeconds: rest, targetRIR: rir, reasons };
    if (heavyBar) overBar.add(out);
    return out;
  }

  /** A clearly lighter load for a deload: about 10% off, at least one step, never below the lightest loadable. */
  lighter(load: number, e: Exercise): number {
    return Math.max(this.round(0, e), Math.min(this.round(load * 0.9, e), this.round(load - this.progressionStep(e), e)));
  }

  /** The history array as passed in: the key for the deload-week cache, shared by Planners on the same history. */
  private source: readonly WorkoutRecord[];

  /** Whether a past workout fell in a deload week. Worked out for the whole history in one pass and cached. */
  wasDeload(date: number): boolean {
    return deloadDates(this.source, this.checkIns).has(date);
  }

  /**
   * The kind of load that sets an exercise's step and rounding. A loaded exercise with no load
   * equipment (a held plate, a weighted vest, a custom lift) steps like plates: 2.5 kg / 5 lb.
   * Undefined for bodyweight work.
   */
  loadKind(e: Exercise): LoadKind | undefined {
    return loadEquipment(e) ?? (isBodyweight(e) ? undefined : 'plates');
  }

  /** One loadable step for double progression; lower-body barbell lifts take two (5 kg / 10 lb). */
  progressionStep(e: Exercise): number {
    const eq = this.loadKind(e);
    if (!eq) return 0;
    const lower = ['squat', 'hinge', 'lunge'].includes(e.pattern) && (eq === 'barbell' || eq === 'trapBar');
    return gymIncrementKg(this.gym, eq) * (lower ? 2 : 1);
  }

  progressionBump(e: Exercise): number {
    const eq = this.loadKind(e);
    // One loadable step in working weight is ~1.15x that step in e1RM at moderate reps.
    return eq ? gymIncrementKg(this.gym, eq) * 1.15 : 0;
  }

  /**
   * Rounds to a loadable weight. The lightest is the empty bar, or one step where there's no bar:
   * a 0 kg dumbbell isn't a prescription, and once logged it would never progress.
   */
  round(weight: number, e: Exercise): number {
    const eq = this.loadKind(e) ?? 'plates';
    const w = gymRound(this.gym, Number.isFinite(weight) ? Math.min(weight, MAX_PLAUSIBLE_KG) : 0, eq);
    return w > 0 ? w : gymRound(this.gym, gymIncrementKg(this.gym, eq), eq);
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
    const eq = this.loadKind(e);
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

import { Catalog } from './catalog';
import {
  type DayFocus, type Exercise, type ExternalActivity, type Goal, type Gym, type Level, type LoggedExercise,
  type MovementPattern, type Muscle, type MuscleMap, type RecoveryOverride, type UserPlan, type WorkoutRecord,
  DAY_MS, focusMuscles, gymBaseLoadKg, gymIncrementKg, gymRound, isBodyweight, levelRank, loadEquipment, muscleName,
  workingSets,
} from './models';
import { computeRecovery } from './recovery';
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
}

export const plannedWorkingSets = (p: PlannedExercise) => p.sets.filter((s) => !s.isWarmup);

export interface PlannedWorkout {
  focus: DayFocus;
  targetMuscles: Muscle[];
  exercises: PlannedExercise[];
  estimatedMinutes: number;
  recovery: MuscleMap;
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
  weeklySetTarget: number;
  sessionSetCap: number;
  compoundBias: number;
}

export function makeScheme(goal: Goal, experience: Level): Scheme {
  const s = ((): Scheme => {
    const mk = (compoundReps: [number, number], isolationReps: [number, number], sets: number, compoundExtraSets: number,
                rir: number, restCompound: number, restIsolation: number, weeklySetTarget: number, sessionSetCap: number,
                compoundBias: number): Scheme => ({
      compoundReps, isolationReps, sets, compoundExtraSets, rir, restCompound, restIsolation, weeklySetTarget,
      sessionSetCap, compoundBias,
    });
    switch (goal) {
      case 'getStronger': return mk([3, 6], [8, 12], 3, 1, 2, 180, 90, 10, 6, 0.8);
      case 'powerlifting': return mk([1, 5], [8, 12], 3, 2, 2, 240, 90, 10, 7, 0.9);
      case 'buildMuscle': return mk([6, 10], [10, 15], 3, 1, 2, 120, 75, 14, 8, 0.4);
      case 'getLean': return mk([8, 12], [12, 15], 3, 0, 2, 75, 60, 12, 7, 0.3);
      case 'improveFitness': return mk([8, 12], [12, 15], 3, 0, 3, 60, 45, 9, 6, 0.3);
      case 'reduceBodyweight': return mk([12, 15], [15, 20], 3, 0, 3, 45, 30, 9, 6, 0.3);
    }
  })();
  if (experience === 'beginner') {
    s.sets = Math.max(2, s.sets - 1);
    s.compoundExtraSets = Math.min(s.compoundExtraSets, 1);
    s.rir += 1;
  } else if (experience === 'advanced') {
    s.compoundExtraSets += 1;
  }
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

const MINOR_MUSCLES: Muscle[] = ['forearms', 'calves', 'adductors', 'abductors', 'lowerBack', 'abs'];

/** Muscle groups the "Fresh Muscles" split chooses between. */
const FRESH_GROUPS: Muscle[][] = [
  ['chest'], ['lats', 'upperBack'], ['shoulders'], ['biceps', 'triceps'], ['quads', 'glutes'], ['hamstrings', 'glutes'],
];

const avg = (recovery: MuscleMap, muscles: Muscle[]) =>
  muscles.reduce((t, m) => t + (recovery[m] ?? 1), 0) / Math.max(1, muscles.length);

const setKey = (ms: Muscle[]) => [...new Set(ms)].sort().join(',');

/** Seconds a planned exercise takes, including rest and warm-ups. */
export function plannedSeconds(p: PlannedExercise): number {
  const working = plannedWorkingSets(p).length;
  return working * (40 + p.restSeconds) + (p.sets.length - working) * 75 + 60;
}

/** Minutes a list of exercises takes, including rest and warm-ups. Recompute after edits. */
export function estimatedMinutes(exercises: PlannedExercise[]): number {
  return Math.round(exercises.reduce((t, p) => t + plannedSeconds(p), 0) / 60);
}

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

  /** Builds today's workout. Pass a different `seed` to regenerate; `focus` forces a day (swap menu). */
  generate(opts: { now?: number; seed?: number; focus?: DayFocus | null } = {}): PlannedWorkout {
    const now = opts.now ?? Date.now();
    const byID = this.byID();
    const recovery = computeRecovery({
      history: this.history, external: this.external, overrides: this.overrides, catalog: byID, now,
    });
    const [focus, targets] = opts.focus ? [opts.focus, this.targetMuscles(opts.focus, recovery)] as const : this.nextFocus(recovery);
    const weekly = this.weeklySetsBy(byID, now);
    const scheme = this.scheme;

    const priority: MuscleMap = {};
    for (const m of targets) {
      const deficit = Math.max(0, 1 - (weekly[m] ?? 0) / scheme.weeklySetTarget);
      const size = m === 'adductors' || m === 'abductors' ? 0.4 : MINOR_MUSCLES.includes(m) ? 0.6 : 1.0;
      priority[m] = (recovery[m] ?? 1) * (0.5 + deficit) * size;
    }

    const rng = new SeededRandom(opts.seed ?? dayNumber(now));
    const eligible = this.catalog.filter((e) => this.isEligible(e) && e.pattern !== 'mobility');
    let chosen: PlannedExercise[] = [];
    const plannedSets: MuscleMap = {};
    const usedPatterns = new Set<MovementPattern>();
    const hitsPerMuscle: MuscleMap = {};
    let seconds = 0;
    const budget = this.plan.sessionMinutes * 60;
    const maxExercises = Math.min(8, Math.max(3, Math.floor(this.plan.sessionMinutes / 9)));
    const targetSet = new Set(targets);

    while (chosen.length < maxExercises) {
      const slot = chosen.length;
      const isolationTargets = new Set(chosen.filter((c) => !c.exercise.isCompound).map((c) => setKey(c.exercise.primary)));
      let best: { exercise: Exercise; score: number; reasons: string[] } | undefined;
      for (const exercise of eligible) {
        if (chosen.some((c) => c.exercise.id === exercise.id)) continue;
        const r = this.score(exercise, slot, targetSet, priority, plannedSets, hitsPerMuscle, isolationTargets,
          usedPatterns, recovery, weekly, scheme, now, rng);
        if (!r) continue;
        if (r[0] > (best?.score ?? -Infinity)) best = { exercise, score: r[0], reasons: r[1] };
      }
      if (!best || !(best.score > -0.4 || chosen.length < 3)) break;

      const planned = this.prescribeWith(best.exercise, scheme, now, best.reasons);
      const cost = plannedSeconds(planned);
      if (seconds + cost > budget && chosen.length >= 3) break;

      chosen.push(planned);
      seconds += cost;
      const setCount = plannedWorkingSets(planned).length;
      for (const m of best.exercise.primary) {
        plannedSets[m] = (plannedSets[m] ?? 0) + setCount;
        hitsPerMuscle[m] = (hitsPerMuscle[m] ?? 0) + 1;
      }
      for (const m of best.exercise.secondary) plannedSets[m] = (plannedSets[m] ?? 0) + setCount * 0.5;
      if (best.exercise.pattern !== 'isolation' && best.exercise.pattern !== 'core') usedPatterns.add(best.exercise.pattern);
    }

    // The 3-exercise minimum can overrun short sessions with long rests: trim sets until it fits.
    while (seconds > budget) {
      let i = -1;
      for (let j = 0; j < chosen.length; j++) {
        if (i < 0 || plannedWorkingSets(chosen[j]).length > plannedWorkingSets(chosen[i]).length) i = j;
      }
      if (i < 0 || plannedWorkingSets(chosen[i]).length <= 2) break;
      const sets = chosen[i].sets;
      let last = -1;
      for (let k = sets.length - 1; k >= 0; k--) if (!sets[k].isWarmup) { last = k; break; }
      if (last < 0) break;
      chosen[i] = { ...chosen[i], sets: sets.filter((_, k) => k !== last) };
      seconds = chosen.reduce((t, p) => t + plannedSeconds(p), 0);
    }

    // Loaded compounds first, then bodyweight compounds, isolations, core.
    const rank = (e: Exercise) => (e.pattern === 'core' ? 3 : !e.isCompound ? 2 : isBodyweight(e) ? 1 : 0);
    chosen = [...chosen].sort((a, b) => rank(a.exercise) - rank(b.exercise));

    return {
      focus,
      targetMuscles: [...targets].sort((a, b) => (priority[b] ?? 0) - (priority[a] ?? 0)),
      exercises: chosen,
      estimatedMinutes: Math.round(seconds / 60),
      recovery,
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
      .sort((a, b) => match(b) - match(a) || a.name.localeCompare(b.name));
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

  private score(e: Exercise, slot: number, targets: Set<Muscle>, priority: MuscleMap, plannedSets: MuscleMap,
                hitsPerMuscle: MuscleMap, isolationTargets: Set<string>, usedPatterns: Set<MovementPattern>,
                recovery: MuscleMap, weekly: MuscleMap, scheme: Scheme, now: number,
                rng: SeededRandom): [number, string[]] | undefined {
    const primaryTargets = e.primary.filter((m) => targets.has(m));
    if (!primaryTargets.length) return undefined;
    // Don't let one day's focus drag in exercises that mostly hit other muscles.
    if (primaryTargets.length * 2 < e.primary.length) return undefined;

    const remaining = (m: Muscle) => Math.max(0, 1 - (plannedSets[m] ?? 0) / scheme.sessionSetCap);
    let score = 0;
    for (const m of primaryTargets) score += (priority[m] ?? 0) * remaining(m);
    for (const m of e.secondary) if (targets.has(m)) score += 0.3 * (priority[m] ?? 0) * remaining(m);

    if (e.isCompound) score += scheme.compoundBias * (slot < 2 ? 1 : 0.4);
    else score += slot >= 2 ? 0.2 : -0.3;
    if (e.pattern !== 'isolation' && e.pattern !== 'core' && usedPatterns.has(e.pattern)) score -= 0.6;
    if (e.pattern === 'core' && (plannedSets.abs ?? 0) > 0) score -= 0.5;
    // Spread the session across muscles instead of stacking variations of one.
    const repeats = Math.max(0, ...e.primary.map((m) => hitsPerMuscle[m] ?? 0));
    // A second isolation for the same muscle is rarely worth a slot; a second compound often is.
    const repeatCost = e.isCompound ? 0.3 : e.primary.every((m) => MINOR_MUSCLES.includes(m)) ? 0.8 : 0.5;
    score -= repeatCost * repeats;
    // Never two isolations working exactly the same muscles (e.g. two calf raises).
    if (!e.isCompound && isolationTargets.has(setKey(e.primary))) return undefined;
    if (levelRank(e.level) > levelRank(this.plan.experience)) score -= 0.3;
    // Loaded lifts are easier to progress; prefer them when the gym has gear.
    if (isBodyweight(e) && this.gym.equipment.length && this.plan.goal !== 'reduceBodyweight') score -= 0.5;

    const reasons: string[] = [];
    const lead = primaryTargets.reduce((a, b) => ((priority[b] ?? 0) > (priority[a] ?? 0) ? b : a));
    reasons.push(`${muscleName(lead)} ${Math.round((recovery[lead] ?? 1) * 100)}% recovered · `
      + `${Math.round(weekly[lead] ?? 0)}/${Math.trunc(scheme.weeklySetTarget)} sets this week`);

    if (e.primary.some((m) => (recovery[m] ?? 1) < 0.4)) score -= 0.5;

    const pref = this.plan.preferences[e.id];
    if (pref === 'more') { score += 0.4; reasons.push('You asked to see this more'); }
    else if (pref === 'less') score -= 0.4;

    const lastDone = this.history.find((r) => r.exercises.some((x) => x.exerciseID === e.id));
    const daysSince = lastDone ? (now - lastDone.date) / DAY_MS : undefined;
    switch (this.plan.variability) {
      case 'consistent':
        if (daysSince !== undefined && daysSince < 21) score += 0.4;
        break;
      case 'balanced':
        if (daysSince !== undefined) score += daysSince < 3 ? -0.25 : daysSince < 21 ? 0.15 : 0;
        break;
      case 'variable':
        if (daysSince !== undefined && daysSince < 7) score -= 0.4;
        else if (daysSince === undefined) score += 0.2;
        break;
    }

    const noise = this.plan.variability === 'consistent' ? 0.05 : this.plan.variability === 'balanced' ? 0.12 : 0.25;
    score += rng.next(-noise, noise);
    return [score, reasons];
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
        if (last && target != null && workingSets(last).length) {
          const hit = workingSets(last).every((s) => s.reps >= target && (s.rir ?? scheme.rir) >= scheme.rir);
          const missed = (l: LoggedExercise) => workingSets(l).some((s) => s.reps < target - 1);
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

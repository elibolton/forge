import {
  Catalog, type DayFocus, type Effort, type Exercise, type Laterality, type PlannedExercise, type PlannedWorkout, type Planner,
  type ProgramRef, type RepRange, type SetType, type Side, isBodyweight, plannedWorkingSets, uuid, isPerSide,
} from '../engine';
import { db } from './db';
import { saving } from './saving.svelte';
import { app } from './store.svelte';
import { type RestSound, playRestSound } from './sounds';
import { swapInSession } from './swap';
import { groupOf, groupRest, linkWithNext, nextInRound, normalizeGroups, unlinkFromNext } from './groups';
import { type PersonalRecord, completesProgramDay, newRecords, workoutLog } from './finishWorkout';

/** One record per exercise, the best one, for a workout that has the same exercise more than once. */
export function bestRecordPerExercise(records: PersonalRecord[]): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  for (const r of records) {
    const seen = best.get(r.exercise.id);
    if (!seen || r.oneRM > seen.oneRM) best.set(r.exercise.id, r);
  }
  return [...best.values()];
}

/** Range extensions to save for a program day: only from slots with work logged. */
export function rangeChanges(s: SessionState): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const e of s.exercises) {
    const p = e.program;
    if (p?.rangeExtension === undefined || !e.sets.some((x) => x.done && !x.isWarmup && x.reps > 0)) continue;
    out[p.slotID] = p.rangeExtension;
  }
  return out;
}

/** Working sets logged so far in a workout. */
export const loggedSetCount = (s: SessionState): number =>
  s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done && !x.isWarmup).length, 0);

export interface SessionSet {
  id: string;
  /** kg; null for bodyweight. */
  weight: number | null;
  reps: number;
  isWarmup: boolean;
  isAMRAP: boolean;
  done: boolean;
  /** For per-arm and per-leg work. */
  side?: Side | null;
  /** Reps left in reserve, rated after the set; null or absent when not rated. */
  rir?: number | null;
  /** Drop or failure set; absent for a straight set. */
  type?: SetType | null;
}

/** Sets that get a number: drop sets belong to the set before them. */
/** The straight or failure set a drop set at index `i` came from. */
export function parentOf(sets: SessionSet[], i: number): SessionSet | undefined {
  for (let j = i - 1; j >= 0; j--) if (!sets[j].isWarmup && sets[j].type !== 'drop') return sets[j];
  return undefined;
}

/**
 * Whether "log as planned" may mark this set done: a working straight or failure set with reps, and a
 * weight when the exercise is loaded. Drop sets added but not done, 0-rep sets and loaded sets with no
 * weight are placeholders, not work.
 */
export const isPlannedSetUsable = (s: SessionSet, loaded: boolean): boolean =>
  !s.isWarmup && s.type !== 'drop' && s.reps > 0 && (!loaded || (s.weight ?? 0) > 0);

export const numberedSets = (sets: SessionSet[]) => sets.filter((s) => !s.isWarmup && s.type !== 'drop');

/** The program prescription behind a session exercise. */
export interface ProgramSlotInfo {
  slotID: string;
  label?: string;
  range: RepRange;
  effort: Effort;
  setsText: string;
  effortText: string;
  restText: string;
  notes: string[];
  lastSetNote?: string;
  laterality: Laterality;
  sideRest?: number;
  supersetGroup?: string;
  /** Set on the first exercise of a group: the rest between its exercises. */
  supersetRestBetween?: number;
  isOptional: boolean;
  suggestionReason?: string;
  /**
   * Big-jump range change to save to the program when the day is logged: extra reps on the top of the
   * range, or null to go back to the normal range. Absent: no change.
   */
  rangeExtension?: number | null;
}

export interface SessionExercise {
  id: string;
  exerciseID: string;
  sets: SessionSet[];
  restSeconds: number;
  targetRIR: number;
  targetReps: number | null;
  /** The old one-rating-per-exercise RIR; sets rated on their own take precedence. */
  rir: number | null;
  reasons: string[];
  program?: ProgramSlotInfo;
  /** Superset, tri-set or circuit (see groups.ts); program days also keep it in `program.supersetGroup`. */
  supersetGroup?: string;
}

/**
 * Whether sets of this exercise get a reps-in-reserve rating. Lowering-only work has no RIR, and timed
 * holds are rated by time, not reps.
 */
export const isRated = (e: SessionExercise): boolean =>
  e.program?.effort.type !== 'eccentricOnly' && !Catalog.exercise(e.exerciseID).isTimed;

/** The superset, tri-set or circuit this exercise belongs to (see groups.ts). */
export const supersetOf = groupOf;

export interface SessionState {
  startedAt: number;
  focus: DayFocus | null;
  exercises: SessionExercise[];
  /** The exercise shown in the logger. */
  currentIndex: number;
  /** Set when this workout is a program day. */
  program?: ProgramRef | null;
  /** Shown as the logger's title for program days, e.g. "Week 2 · Pull". */
  title?: string;
  /** The last time anything in the workout changed. */
  updatedAt?: number;
  /**
   * The id the finished workout is saved under, fixed when the workout starts. Finishing twice (the app
   * killed between saving the log and clearing the workout) then replaces the log instead of adding one.
   */
  logID?: string;
}

/** A workout untouched this long was most likely finished without tapping Finish. */
export const STALE_AFTER = 3 * 3_600_000;

export type { PersonalRecord };

export const exerciseOf = (e: SessionExercise) => Catalog.exercise(e.exerciseID);

/** All working sets done; skipped warm-ups don't count against it. */
export function isComplete(e: SessionExercise): boolean {
  const working = e.sets.filter((s) => !s.isWarmup);
  return working.length > 0 && working.every((s) => s.done);
}

export const newSet = (weight: number | null, reps: number, o: Partial<SessionSet> = {}): SessionSet =>
  ({ id: uuid(), weight, reps, isWarmup: false, isAMRAP: false, done: false, ...o });

export function sessionExerciseFrom(p: PlannedExercise): SessionExercise {
  return {
    id: uuid(), exerciseID: p.exercise.id,
    sets: p.sets.map((s) => newSet(s.weight, s.reps, { isWarmup: s.isWarmup, isAMRAP: s.isAMRAP })),
    restSeconds: p.restSeconds, targetRIR: p.targetRIR, targetReps: plannedWorkingSets(p)[0]?.reps ?? null, rir: null,
    reasons: p.reasons, supersetGroup: p.supersetGroup,
  };
}

/** The workout in progress. Saved on every change so it survives the app being closed. */
class WorkoutSession {
  state = $state.raw<SessionState | null>(null);
  restEndsAt = $state<number | null>(null);
  restTotal = $state(0);
  /** Set after finishing, for the summary sheet. */
  finished = $state<{ records: PersonalRecord[] } | null>(null);
  /** Full-screen logger vs. the minimized bar over the tabs. */
  isExpanded = $state(true);

  private wakeLock: WakeLockSentinel | null = null;
  private audio: AudioContext | null = null;
  private restTimer: ReturnType<typeof setTimeout> | undefined;

  get isActive() { return this.state !== null; }

  /** The set just logged, waiting for a quick "reps left?" rating. Not saved; skipping it is fine. */
  pendingRating = $state<{ exerciseID: string; setID: string } | null>(null);

  /** Set when a workout in progress has sat untouched for hours; the app asks if you're still training. */
  staleSince = $state<number | null>(null);

  /** When the workout last changed. */
  get lastActiveAt(): number { return this.state ? (this.state.updatedAt ?? this.state.startedAt) : Date.now(); }

  /** The quiet spell the user closed the "Still training?" sheet on, so it isn't asked again every minute. */
  private staleDismissedFor: number | null = null;

  /** Flags a forgotten workout, so it isn't saved as a 14-hour session. */
  checkStale(now = Date.now()) {
    const stale = this.state && now - this.lastActiveAt > STALE_AFTER && this.staleDismissedFor !== this.lastActiveAt;
    this.staleSince = stale ? this.lastActiveAt : null;
  }

  /**
   * When a workout finishing now really ended: now, or the last change when it has sat untouched for
   * hours (left open overnight with the screen on), so the duration isn't 10+ hours.
   */
  endedAt(now = Date.now()): number {
    return this.state && now - this.lastActiveAt > STALE_AFTER ? this.lastActiveAt : now;
  }

  /** "Still training": carry on, and don't ask again until it goes quiet for hours once more. */
  keepGoing() {
    this.staleSince = null;
    this.update(() => {});
  }

  /** The sheet was closed without an answer: stop asking for this quiet spell, but don't count it as activity. */
  dismissStale() {
    this.staleDismissedFor = this.lastActiveAt;
    this.staleSince = null;
  }

  /** True while a finish is saving, so a second tap can't log the workout twice. */
  saving = $state(false);

  async load() {
    let saved: { state: SessionState; restEndsAt?: number; restTotal?: number } | undefined;
    try {
      saved = await db.get('session');
    } catch (e) {
      // Starting a new workout now would write over the one still on the device.
      console.error('Could not load the workout in progress', e);
      app.loadError ??= e instanceof Error ? e.message : String(e);
      return;
    }
    if (saved?.state && Array.isArray(saved.state.exercises)) {
      // Saved before workouts had a log id: give it one now, so finishing it is safe to repeat.
      this.state = saved.state.logID ? saved.state : { ...saved.state, logID: uuid() };
      if (saved.restEndsAt && saved.restEndsAt > Date.now()) {
        this.restEndsAt = saved.restEndsAt;
        this.restTotal = saved.restTotal ?? 0;
        this.scheduleRestAlert();
      }
      this.keepAwake();
      this.checkStale();
    }
  }

  private persist() {
    if (this.state) {
      const snap = { state: $state.snapshot(this.state), restEndsAt: this.restEndsAt, restTotal: this.restTotal };
      saving.run('session', () => db.set('session', snap));
    } else saving.run('session', () => db.del('session'));
  }

  /**
   * Clone, change, save. The building block for the named changes below; screens use those, so the
   * rules for a workout in progress live here rather than in the UI.
   */
  update(change: (s: SessionState) => void, opts: { activity?: boolean } = {}) {
    if (!this.state) return;
    const next = structuredClone(this.state);
    change(next);
    // Only real changes count as training; looking around (moving between exercises) doesn't.
    if (opts.activity !== false) next.updatedAt = Date.now();
    this.state = next;
    this.persist();
  }

  updateExercise(id: string, change: (e: SessionExercise) => void) {
    this.update((s) => { const e = s.exercises.find((x) => x.id === id); if (e) change(e); });
  }

  /**
   * Starting a workout replaces the one in progress, so it only happens with `replace` set: screens ask
   * first (see `okToReplace`). Returns whether it started.
   */
  private begin(state: SessionState, replace: boolean): boolean {
    if (this.state && !replace) return false;
    state.logID ??= uuid();
    this.unlockAudio();
    this.restEndsAt = null;
    clearTimeout(this.restTimer);
    this.staleSince = null;
    this.pendingRating = null;
    this.state = state;
    this.isExpanded = true;
    this.persist();
    this.keepAwake();
    return true;
  }

  /**
   * Whether it's fine to start a new workout: always when none is in progress, otherwise only if you
   * agree to throw the current one away. `ask` shows the question (a confirm dialog by default).
   */
  okToReplace(ask: (message: string) => boolean = (m) => confirm(m)): boolean {
    if (!this.state) return true;
    const sets = loggedSetCount(this.state);
    const what = sets ? `${sets} logged set${sets === 1 ? '' : 's'}` : 'a workout in progress';
    return ask(`You have ${what}. Discard ${sets > 1 ? 'them' : 'it'} and start a new workout?`);
  }

  /** `prepare` can adjust the session before it starts (adding warm-up and cool-down). */
  start(workout: PlannedWorkout, prepare?: (s: SessionState) => void, replace = false): boolean {
    if (this.state && !replace) return false;
    const state: SessionState = { startedAt: Date.now(), focus: workout.focus, exercises: workout.exercises.map(sessionExerciseFrom), currentIndex: 0 };
    prepare?.(state);
    return this.begin(state, replace);
  }

  /** Starts a prepared session (a program day or saved workout). */
  startPrepared(state: SessionState, replace = false): boolean { return this.begin(state, replace); }

  startEmpty(replace = false): boolean {
    return this.begin({ startedAt: Date.now(), focus: null, exercises: [], currentIndex: 0 }, replace);
  }

  /**
   * Brings back a discarded session (Undo). Does nothing if another workout has started since, so the
   * undo can't throw that one away. Returns whether it was restored.
   */
  restore(snapshot: SessionState): boolean {
    if (this.state && this.state.logID !== snapshot.logID) return false;
    return this.begin(snapshot, true);
  }

  // MARK: Exercises

  /** Shows exercise `index` in the logger. */
  goTo(index: number) {
    this.update((s) => { if (index >= 0 && index < s.exercises.length) s.currentIndex = index; }, { activity: false });
  }

  /** Adds an exercise at the end and shows it. */
  addExercise(planned: PlannedExercise) {
    this.update((s) => {
      const x = sessionExerciseFrom(planned);
      delete x.supersetGroup; // a generator pairing means nothing in this workout
      s.exercises.push(x);
      s.currentIndex = s.exercises.length - 1;
    });
  }

  /** Removes an exercise. Returns an undo that puts it back where it was. */
  removeExercise(id: string): (() => void) | undefined {
    const index = this.state?.exercises.findIndex((x) => x.id === id) ?? -1;
    if (!this.state || index < 0) return undefined;
    // Undo puts back only this exercise, so sets logged on the others in the meantime stay logged.
    const removed = structuredClone($state.snapshot(this.state.exercises[index]));
    const wasShowing = this.state.currentIndex === index;
    const workout = this.state.logID;
    this.update((s) => {
      s.exercises.splice(index, 1);
      if (s.currentIndex >= s.exercises.length) s.currentIndex = Math.max(0, s.exercises.length - 1);
      normalizeGroups(s);
    });
    return () => this.update((s) => {
      if (s.logID !== workout || s.exercises.some((x) => x.id === id)) return;
      const at = Math.min(index, s.exercises.length);
      s.exercises.splice(at, 0, removed);
      if (wasShowing) s.currentIndex = at; else if (s.currentIndex >= at) s.currentIndex = Math.min(s.currentIndex + 1, s.exercises.length - 1);
      normalizeGroups(s);
    });
  }

  /** Moves exercise `id` up (-1) or down (+1); the one showing stays showing. */
  moveExercise(id: string, by: -1 | 1) {
    this.update((s) => {
      const i = s.exercises.findIndex((x) => x.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= s.exercises.length) return;
      [s.exercises[i], s.exercises[j]] = [s.exercises[j], s.exercises[i]];
      if (s.currentIndex === i) s.currentIndex = j; else if (s.currentIndex === j) s.currentIndex = i;
      normalizeGroups(s);
    });
  }

  /** Groups exercise `id` with the one after it: a superset, or a tri-set or circuit as more join. */
  linkWithNext(id: string) {
    this.update((s) => { const i = s.exercises.findIndex((x) => x.id === id); if (i >= 0) linkWithNext(s, i); });
  }

  /** Splits the group between exercise `id` and the one after it. */
  unlinkFromNext(id: string) {
    this.update((s) => { const i = s.exercises.findIndex((x) => x.id === id); if (i >= 0) unlinkFromNext(s, i); });
  }

  /** Swaps exercise `id` for `replacement`, keeping any sets already logged (see `swapInSession`). */
  swapExercise(id: string, replacement: Exercise, planner: Planner): boolean {
    let swapped = false;
    this.update((s) => { swapped = swapInSession(s, id, replacement, planner); normalizeGroups(s); });
    return swapped;
  }

  /** How many reps were left in the tank on this exercise's last set. */
  setRIR(exerciseID: string, rir: number | null) {
    this.updateExercise(exerciseID, (e) => { e.rir = rir === null ? null : Math.max(0, Math.round(rir)); });
  }

  /**
   * Rates one set: reps left in reserve. Rating the right side of a per-side round also rates its
   * left side, if that wasn't rated, since both were asked about as one set.
   */
  rateSet(exerciseID: string, setID: string, rir: number | null) {
    const value = rir === null ? null : Math.max(0, Math.round(rir));
    this.updateExercise(exerciseID, (e) => {
      const i = e.sets.findIndex((x) => x.id === setID);
      if (i < 0) return;
      e.sets[i].rir = value;
      if (e.sets[i].side !== 'right' || e.sets[i].type === 'drop') return;
      // The left straight set of this round, past any drop sets added after it.
      for (let j = i - 1; j >= 0; j--) {
        const before = e.sets[j];
        if (before.isWarmup || before.type === 'drop') continue;
        if (before.side === 'left' && before.rir == null) before.rir = value;
        break;
      }
    });
    if (this.pendingRating?.setID === setID) this.pendingRating = null;
  }

  /** Not now: closes the rating prompt, leaving the set unrated. */
  skipRating() { this.pendingRating = null; }

  // MARK: Sets

  /** Changes a set's weight (kg, null for bodyweight) or reps. Never negative; reps are whole. */
  editSet(exerciseID: string, setID: string, change: { weight?: number | null; reps?: number }) {
    this.updateExercise(exerciseID, (e) => {
      const set = e.sets.find((x) => x.id === setID);
      if (!set) return;
      if (change.weight !== undefined) set.weight = change.weight === null ? null : Math.max(0, change.weight);
      if (change.reps !== undefined) set.reps = Math.max(0, Math.round(change.reps));
    });
  }

  /** Marks a set done or not, without starting rest (that's `logSet`). */
  setDone(exerciseID: string, setID: string, done: boolean) {
    this.updateExercise(exerciseID, (e) => { const set = e.sets.find((x) => x.id === setID); if (set) set.done = done; });
  }

  /** Makes a working set a drop or failure set, or a straight set again with null. */
  setType(exerciseID: string, setID: string, type: SetType | null) {
    this.updateExercise(exerciseID, (e) => {
      const set = e.sets.find((x) => x.id === setID);
      if (!set || set.isWarmup) return;
      const was = set.type;
      if (type) set.type = type; else delete set.type;
      if (type === 'failure' && set.done) set.rir = 0;
      // The 0 came from "to failure", not a rating, so ask again.
      else if (was === 'failure' && type !== 'failure' && set.rir === 0) set.rir = null;
    });
  }

  /**
   * Adds a drop set after set `afterID` (and any drops already after it), at `weight` kg and the same
   * reps. Logging the set before it then goes straight on to it with no rest.
   */
  addDropSet(exerciseID: string, afterID: string, weight: number | null) {
    this.updateExercise(exerciseID, (e) => {
      let i = e.sets.findIndex((x) => x.id === afterID);
      if (i < 0 || e.sets[i].isWarmup) return;
      const reps = e.sets[i].reps;
      while (e.sets[i + 1]?.type === 'drop') i++;
      e.sets.splice(i + 1, 0, newSet(weight, reps, { type: 'drop', side: e.sets[i].side ?? null }));
    });
  }

  removeSet(exerciseID: string, setID: string) {
    this.updateExercise(exerciseID, (e) => { e.sets = e.sets.filter((x) => x.id !== setID); });
  }

  /** Adds a working set like the last one; per-side work gets a left and a right. */
  addSet(exerciseID: string) {
    this.updateExercise(exerciseID, (e) => {
      const straight = numberedSets(e.sets);
      const last = straight[straight.length - 1];
      const weight = last?.weight ?? null, reps = last?.reps ?? 10;
      if (e.program && isPerSide(e.program.laterality)) {
        e.sets.push(newSet(weight, reps, { side: 'left' }), newSet(weight, reps, { side: 'right' }));
      } else e.sets.push(newSet(weight, reps));
    });
  }

  /** Marks a set done, carries its weight to the remaining sets and starts rest. */
  logSet(setID: string, exerciseID: string) {
    this.unlockAudio();
    const state = this.state;
    if (!state) return;
    const ei = state.exercises.findIndex((e) => e.id === exerciseID);
    const ex = state.exercises[ei];
    const si = ex?.sets.findIndex((s) => s.id === setID) ?? -1;
    if (!ex || si < 0) return;
    const wasDone = ex.sets[si].done;
    let restFor: number | undefined;
    let jumpTo: number | undefined;

    this.update((s) => {
      const e = s.exercises[ei];
      const logged = e.sets[si];
      logged.done = true;
      // To failure means nothing left in reserve.
      if (logged.type === 'failure' && logged.rir == null) logged.rir = 0;
      // The weight carries on to the straight sets still to do; drop sets keep their lighter weight.
      if (!logged.isWarmup && logged.type !== 'drop') {
        for (let j = si + 1; j < e.sets.length; j++) {
          if (!e.sets[j].isWarmup && !e.sets[j].done && e.sets[j].type !== 'drop') e.sets[j].weight = logged.weight;
        }
      }
    });
    const after = this.state!.exercises[ei];
    const set = after.sets[si];
    if (wasDone || set.isWarmup) return;
    const dropNext = after.sets[si + 1];
    if (dropNext && dropNext.type === 'drop' && !dropNext.done) {
      // Straight on to the drop set: no rest, same exercise. Rate the set once the drops are done.
      this.pendingRating = null;
      return;
    }
    const info = after.program;
    const group = supersetOf(after);
    const firstSide = !!info && isPerSide(info.laterality) && set.side === 'left' && after.sets.some((x) => x.side === 'right' && !x.done && !x.isWarmup);
    // Ask once per round: after the right side when per-side.
    // A failure set is already rated (0 left); a drop set is rated with the set it came from.
    const rate = set.type === 'drop' ? parentOf(after.sets, si) : set;
    this.pendingRating = !firstSide && isRated(after) && rate && rate.type !== 'failure' ? { exerciseID: after.id, setID: rate.id } : null;
    if (firstSide) {
      // First side of a per-side set: short (or no) rest, then the other side.
      if (info.sideRest) restFor = info.sideRest;
    } else if (group) {
      // Supersets, tri-sets and circuits: on to the next exercise with a short rest, the full rest
      // after each round.
      const step = nextInRound(this.state!, ei);
      restFor = groupRest(this.state!, ei, step.endOfRound);
      jumpTo = step.next;
    } else restFor = after.restSeconds;

    if (jumpTo !== undefined) this.update((s) => { s.currentIndex = jumpTo!; });
    if (restFor) this.startRest(restFor);
  }

  /** Logs every remaining working set as planned (from the finish review). */
  logRemainingAsPlanned() {
    this.update((s) => {
      for (const e of s.exercises) {
        const loaded = !isBodyweight(Catalog.exercise(e.exerciseID));
        for (const set of e.sets) if (isPlannedSetUsable(set, loaded)) set.done = true;
      }
    });
  }

  startRest(seconds: number) {
    this.restTotal = seconds;
    this.restEndsAt = Date.now() + seconds * 1000;
    this.scheduleRestAlert();
    this.persist();
  }

  extendRest(seconds: number) {
    if (this.restEndsAt === null) return;
    // After rest has run out, +15 s means 15 more seconds from now.
    this.restEndsAt = Math.max(this.restEndsAt, Date.now()) + seconds * 1000;
    this.restTotal += seconds;
    this.scheduleRestAlert();
    this.persist();
  }

  skipRest() {
    this.restEndsAt = null;
    clearTimeout(this.restTimer);
    this.persist();
  }

  /** Ends the workout without saving. Returns what it was, for an undo via `restore`. */
  discard(): SessionState | null {
    const was = this.state && structuredClone($state.snapshot(this.state));
    this.state = null;
    this.staleSince = null;
    this.pendingRating = null;
    this.restEndsAt = null;
    clearTimeout(this.restTimer);
    this.persist();
    this.releaseWake();
    return was;
  }

  /**
   * Saves completed sets and returns any new personal records. The workout stays open until the save
   * has reached the device; if it doesn't, this returns null and nothing is lost. `endedAt` sets when it
   * ended, for a workout finished hours after the last set.
   */
  async finish(endedAt = this.endedAt()): Promise<PersonalRecord[] | null> {
    const state = this.state;
    if (!state || this.saving) return null;
    // The same id every time, so finishing again after a crash replaces the log rather than adding one.
    const log = workoutLog(state, state.logID ?? uuid(), endedAt);
    // Against history before this workout joins it.
    const records = log ? bestRecordPerExercise(newRecords(log.exercises, app.derivedHistory.bestOneRM)) : [];
    if (log) {
      this.saving = true;
      const saved = await app.addLog(log).finally(() => { this.saving = false; });
      if (!saved) {
        app.dropUnsavedLog(log.id);
        return null;
      }
    }
    if (completesProgramDay(log)) app.completeProgramDay(state.program!, rangeChanges(state));
    this.discard();
    this.finished = { records };
    return records;
  }

  // MARK: Rest alert: a chime and buzz while the app is open. The screen stays awake during a workout.

  unlockAudio() {
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === 'suspended') this.audio.resume();
    } catch { /* no audio */ }
  }

  private scheduleRestAlert() {
    clearTimeout(this.restTimer);
    if (this.restEndsAt === null) return;
    const ms = this.restEndsAt - Date.now();
    if (ms <= 0) return;
    this.restTimer = setTimeout(() => this.chime(), ms);
  }

  private chime() {
    navigator.vibrate?.([200, 100, 200]);
    if (this.audio) playRestSound(this.audio, app.get<RestSound>('restSound') ?? 'chime');
  }

  /** Plays a timer sound now (the settings preview); also unlocks audio for later. */
  preview(sound: RestSound) {
    this.unlockAudio();
    setTimeout(() => this.audio && playRestSound(this.audio, sound), 60);
  }

  async keepAwake() {
    try {
      if (document.visibilityState === 'visible' && this.state && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock?.request('screen');
        this.wakeLock?.addEventListener('release', () => { this.wakeLock = null; });
      }
    } catch { /* not supported or denied */ }
  }

  private releaseWake() {
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }
}

export const session = new WorkoutSession();

if (typeof document !== 'undefined') {
  // The lock drops whenever the app goes to the background; take it again on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    session.keepAwake();
    session.checkStale();
  });
  // The wake lock keeps the page visible, so a workout left open overnight never fires the check above.
  setInterval(() => { if (session.isActive && session.staleSince === null) session.checkStale(); }, 60_000);
}

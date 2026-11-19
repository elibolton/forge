import {
  Catalog, type DayFocus, type Effort, type Exercise, type Laterality, type PlannedExercise, type PlannedWorkout, type Planner,
  type ProgramRef, type RepRange, type Side, plannedWorkingSets, uuid, isPerSide,
} from '../engine';
import { db } from './db';
import { saving } from './saving.svelte';
import { app } from './store.svelte';
import { type RestSound, playRestSound } from './sounds';
import { swapInSession } from './swap';
import { type PersonalRecord, completesProgramDay, newRecords, workoutLog } from './finishWorkout';

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
}

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
  /** Set on the first exercise of a superset pair. */
  supersetRestBetween?: number;
  isOptional: boolean;
  suggestionReason?: string;
}

export interface SessionExercise {
  id: string;
  exerciseID: string;
  sets: SessionSet[];
  restSeconds: number;
  targetRIR: number;
  targetReps: number | null;
  rir: number | null;
  reasons: string[];
  program?: ProgramSlotInfo;
  /** Superset pairing from the workout generator; program days use `program.supersetGroup`. */
  supersetGroup?: string;
}

/** The superset this exercise belongs to, whichever way it was paired. */
export const supersetOf = (e: SessionExercise): string | undefined => e.supersetGroup ?? e.program?.supersetGroup;

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

  /** Set when a workout in progress has sat untouched for hours; the app asks if you're still training. */
  staleSince = $state<number | null>(null);

  /** When the workout last changed. */
  get lastActiveAt(): number { return this.state ? (this.state.updatedAt ?? this.state.startedAt) : Date.now(); }

  /** Flags a forgotten workout, so it isn't saved as a 14-hour session. */
  checkStale(now = Date.now()) {
    this.staleSince = this.state && now - this.lastActiveAt > STALE_AFTER ? this.lastActiveAt : null;
  }

  /** "Still training": carry on, and don't ask again until it goes quiet for hours once more. */
  keepGoing() {
    this.staleSince = null;
    this.update(() => {});
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
      this.state = saved.state;
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
  update(change: (s: SessionState) => void) {
    if (!this.state) return;
    const next = structuredClone(this.state);
    change(next);
    next.updatedAt = Date.now();
    this.state = next;
    this.persist();
  }

  updateExercise(id: string, change: (e: SessionExercise) => void) {
    this.update((s) => { const e = s.exercises.find((x) => x.id === id); if (e) change(e); });
  }

  private begin(state: SessionState) {
    this.unlockAudio();
    this.staleSince = null;
    this.state = state;
    this.isExpanded = true;
    this.persist();
    this.keepAwake();
  }

  /** `prepare` can adjust the session before it starts (adding warm-up and cool-down). */
  start(workout: PlannedWorkout, prepare?: (s: SessionState) => void) {
    const state: SessionState = { startedAt: Date.now(), focus: workout.focus, exercises: workout.exercises.map(sessionExerciseFrom), currentIndex: 0 };
    prepare?.(state);
    this.begin(state);
  }

  /** Starts a prepared session (a program day). */
  startPrepared(state: SessionState) { this.begin(state); }

  startEmpty() { this.begin({ startedAt: Date.now(), focus: null, exercises: [], currentIndex: 0 }); }

  /** Brings back a discarded session (Undo). */
  restore(snapshot: SessionState) { this.begin(snapshot); }

  // MARK: Exercises

  /** Shows exercise `index` in the logger. */
  goTo(index: number) {
    this.update((s) => { if (index >= 0 && index < s.exercises.length) s.currentIndex = index; });
  }

  /** Adds an exercise at the end and shows it. */
  addExercise(planned: PlannedExercise) {
    this.update((s) => { s.exercises.push(sessionExerciseFrom(planned)); s.currentIndex = s.exercises.length - 1; });
  }

  /** Removes an exercise. Returns an undo that puts it back where it was. */
  removeExercise(id: string): (() => void) | undefined {
    const before = this.state && structuredClone({ exercises: this.state.exercises, currentIndex: this.state.currentIndex });
    if (!before || !before.exercises.some((x) => x.id === id)) return undefined;
    this.update((s) => {
      s.exercises = s.exercises.filter((x) => x.id !== id);
      if (s.currentIndex >= s.exercises.length) s.currentIndex = Math.max(0, s.exercises.length - 1);
    });
    return () => this.update((s) => { s.exercises = before.exercises; s.currentIndex = before.currentIndex; });
  }

  /** Moves exercise `id` up (-1) or down (+1); the one showing stays showing. */
  moveExercise(id: string, by: -1 | 1) {
    this.update((s) => {
      const i = s.exercises.findIndex((x) => x.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= s.exercises.length) return;
      [s.exercises[i], s.exercises[j]] = [s.exercises[j], s.exercises[i]];
      if (s.currentIndex === i) s.currentIndex = j; else if (s.currentIndex === j) s.currentIndex = i;
    });
  }

  /** Swaps exercise `id` for `replacement`, keeping any sets already logged (see `swapInSession`). */
  swapExercise(id: string, replacement: Exercise, planner: Planner) {
    this.update((s) => swapInSession(s, id, replacement, planner));
  }

  /** How many reps were left in the tank on this exercise's last set. */
  setRIR(exerciseID: string, rir: number | null) {
    this.updateExercise(exerciseID, (e) => { e.rir = rir === null ? null : Math.max(0, Math.round(rir)); });
  }

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

  removeSet(exerciseID: string, setID: string) {
    this.updateExercise(exerciseID, (e) => { e.sets = e.sets.filter((x) => x.id !== setID); });
  }

  /** Adds a working set like the last one; per-side work gets a left and a right. */
  addSet(exerciseID: string) {
    this.updateExercise(exerciseID, (e) => {
      const working = e.sets.filter((x) => !x.isWarmup);
      const last = working[working.length - 1];
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
      e.sets[si].done = true;
      if (!e.sets[si].isWarmup) {
        for (let j = si + 1; j < e.sets.length; j++) {
          if (!e.sets[j].isWarmup && !e.sets[j].done) e.sets[j].weight = e.sets[si].weight;
        }
      }
    });
    const after = this.state!.exercises[ei];
    const set = after.sets[si];
    if (wasDone || set.isWarmup) return;
    const info = after.program;
    const group = supersetOf(after);
    if (info && isPerSide(info.laterality) && set.side === 'left' && after.sets.some((x) => x.side === 'right' && !x.done && !x.isWarmup)) {
      // First side of a per-side set: short (or no) rest, then the other side.
      if (info.sideRest) restFor = info.sideRest;
    } else if (group) {
      // Supersets: alternate between the pair, short rest in between, full rest after the pair.
      const exercises = this.state!.exercises;
      const partner = exercises.findIndex((x, i) => i !== ei && supersetOf(x) === group);
      restFor = partner >= 0 ? (info?.supersetRestBetween ?? after.restSeconds) : after.restSeconds;
      if (partner >= 0 && exercises[partner].sets.some((x) => !x.isWarmup && !x.done)) jumpTo = partner;
    } else restFor = after.restSeconds;

    if (jumpTo !== undefined) this.update((s) => { s.currentIndex = jumpTo!; });
    if (restFor) this.startRest(restFor);
  }

  /** Logs every remaining working set as planned (from the finish review). */
  logRemainingAsPlanned() {
    this.update((s) => { for (const e of s.exercises) for (const set of e.sets) if (!set.isWarmup) set.done = true; });
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
  async finish(endedAt = Date.now()): Promise<PersonalRecord[] | null> {
    const state = this.state;
    if (!state || this.saving) return null;
    const log = workoutLog(state, uuid(), endedAt);
    // Against history before this workout joins it.
    const records = log ? newRecords(log.exercises, app.derivedHistory.bestOneRM) : [];
    if (log) {
      this.saving = true;
      const saved = await app.addLog(log).finally(() => { this.saving = false; });
      if (!saved) {
        app.dropUnsavedLog(log.id);
        return null;
      }
    }
    if (completesProgramDay(log)) app.completeProgramDay(state.program!);
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
}

import {
  Catalog, type DayFocus, type Effort, type Exercise, type Laterality, type LoggedExercise, type PlannedExercise,
  type PlannedWorkout, type ProgramRef, type RepRange, type Side, oneRM, plannedWorkingSets, uuid, workingSets, isPerSide,
  effortRIR,
} from '../engine';
import { db } from './db';
import { app } from './store.svelte';
import { type RestSound, playRestSound } from './sounds';

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
}

export interface PersonalRecord { exercise: Exercise; oneRM: number; previous: number }

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

  async load() {
    const saved = await db.get<{ state: SessionState; restEndsAt?: number; restTotal?: number }>('session');
    if (saved?.state && Array.isArray(saved.state.exercises)) {
      this.state = saved.state;
      if (saved.restEndsAt && saved.restEndsAt > Date.now()) {
        this.restEndsAt = saved.restEndsAt;
        this.restTotal = saved.restTotal ?? 0;
        this.scheduleRestAlert();
      }
      this.keepAwake();
    }
  }

  private persist() {
    if (this.state) db.set('session', { state: $state.snapshot(this.state), restEndsAt: this.restEndsAt, restTotal: this.restTotal });
    else db.del('session');
  }

  /** Clone, change, save. */
  update(change: (s: SessionState) => void) {
    if (!this.state) return;
    const next = structuredClone(this.state);
    change(next);
    this.state = next;
    this.persist();
  }

  updateExercise(id: string, change: (e: SessionExercise) => void) {
    this.update((s) => { const e = s.exercises.find((x) => x.id === id); if (e) change(e); });
  }

  private begin(state: SessionState) {
    this.unlockAudio();
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

  discard() {
    this.state = null;
    this.restEndsAt = null;
    clearTimeout(this.restTimer);
    this.persist();
    this.releaseWake();
  }

  /** Saves completed sets and returns any new personal records. */
  finish(): PersonalRecord[] {
    const state = this.state;
    if (!state) return [];
    const logged: LoggedExercise[] = [];
    for (const ex of state.exercises) {
      const eccentric = ex.program?.effort.type === 'eccentricOnly';
      const sets = ex.sets.filter((s) => s.done).map((s) => ({
        weight: s.weight ?? 0, reps: s.reps, rir: s.isWarmup || eccentric ? null : ex.rir, isWarmup: s.isWarmup, side: s.side ?? null,
      }));
      if (!sets.length) continue;
      logged.push({
        exerciseID: ex.exerciseID, sets, targetReps: ex.targetReps, slotID: ex.program?.slotID ?? null,
        repRange: ex.program?.range ?? null, targetRIR: ex.program ? effortRIR(ex.program.effort)?.low ?? null : null,
      });
    }

    const best = app.derivedHistory.bestOneRM;
    const records: PersonalRecord[] = [];
    for (const ex of logged) {
      const values = workingSets(ex).filter((s) => s.weight > 0).map((s) => oneRM(s.weight, s.reps, s.rir));
      const top = values.length ? Math.max(...values) : 0;
      const previous = best.get(ex.exerciseID);
      if (previous !== undefined && top > previous * 1.005) records.push({ exercise: Catalog.exercise(ex.exerciseID), oneRM: top, previous });
    }

    const loggedWorking = logged.some((l) => workingSets(l).length > 0);
    if (logged.length) {
      app.addLog({
        id: uuid(), date: state.startedAt, focus: state.focus, durationSeconds: Math.round((Date.now() - state.startedAt) / 1000),
        exercises: logged, program: state.program ?? null,
      });
    }
    if (state.program && loggedWorking) app.completeProgramDay(state.program);
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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') session.keepAwake(); });
}

import {
  Catalog, type DayFocus, type Exercise, type Gym, Gyms, type LoggedExercise, type LoggedSet, Planner, Programs,
  type ProgramProgress, type ProgramRef, type RecoveryOverride, type UserPlan, type WorkoutProgram, type WorkoutRecord,
  completeDay, defaultPlan, lossy, oneRM, readExercise, readGym, readLogged, readOverride, readPlan, readProgramRef,
  readProgress, uuid, workingSets, loadEquipment, POUNDS_PER_KG, gymIncrement,
} from '../engine';
import { db, requestPersistence } from './db';
import { WeightUnits } from './units';

// MARK: - Stored shapes

export interface Profile {
  plan: UserPlan;
  gyms: Gym[];
  overrides: RecoveryOverride[];
  activeGymID: string;
  usesPounds: boolean;
  createdAt: number;
  /** User-made exercises. */
  customExercises: Exercise[];
  /** The active program and where you are in it. */
  programProgress: ProgramProgress | null;
}

export interface WorkoutLog {
  id: string;
  date: number;
  focus: DayFocus | null;
  durationSeconds: number;
  exercises: LoggedExercise[];
  /** The program day this was, if any. */
  program: ProgramRef | null;
}

export const logRecord = (l: WorkoutLog): WorkoutRecord => ({ date: l.date, focus: l.focus, exercises: l.exercises, program: l.program });

/** Total weight moved in working sets (kg). */
export const logVolume = (l: WorkoutLog) =>
  l.exercises.flatMap(workingSets).reduce((t, s) => t + s.weight * s.reps, 0);

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function readProfile(v: unknown): Profile | null {
  if (!isObj(v)) return null;
  const gyms = lossy(v.gyms, readGym);
  const safeGyms = gyms.length ? gyms : [Gyms.commercial()];
  return {
    plan: readPlan(v.plan),
    gyms: safeGyms,
    overrides: lossy(v.overrides, readOverride),
    activeGymID: typeof v.activeGymID === 'string' ? v.activeGymID : safeGyms[0].id,
    usesPounds: typeof v.usesPounds === 'boolean' ? v.usesPounds : false,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now(),
    customExercises: lossy(v.customExercises, readExercise),
    programProgress: readProgress(v.programProgress),
  };
}

function readLog(v: unknown): WorkoutLog | undefined {
  if (!isObj(v) || typeof v.date !== 'number') return undefined;
  return {
    id: typeof v.id === 'string' ? v.id : uuid(),
    date: v.date,
    focus: typeof v.focus === 'string' ? (v.focus as DayFocus) : null,
    durationSeconds: typeof v.durationSeconds === 'number' ? v.durationSeconds : 0,
    exercises: lossy(v.exercises, readLogged),
    program: readProgramRef(v.program),
  };
}

// MARK: - Store

class AppStore {
  ready = $state(false);
  profile = $state.raw<Profile | null>(null);
  /** Newest first. */
  logs = $state.raw<WorkoutLog[]>([]);
  /** Small per-device UI values (today's plan, program day edits, generator day…). */
  kv = $state.raw<Record<string, unknown>>({});

  records = $derived(this.logs.map(logRecord));

  /** Per-exercise facts screens need, rebuilt only when the log changes. */
  derivedHistory = $derived.by(() => {
    const lastWorkingSets = new Map<string, LoggedSet[]>();
    const bestOneRM = new Map<string, number>();
    const sessions = new Map<string, { date: number; logged: LoggedExercise; logID: string }[]>();
    for (const log of this.logs) {
      for (const logged of log.exercises) {
        const id = logged.exerciseID;
        if (!lastWorkingSets.has(id)) lastWorkingSets.set(id, workingSets(logged));
        const list = sessions.get(id) ?? [];
        list.push({ date: log.date, logged, logID: log.id });
        sessions.set(id, list);
        for (const s of workingSets(logged)) {
          if (s.weight <= 0) continue;
          const e = oneRM(s.weight, s.reps, s.rir);
          if (e > (bestOneRM.get(id) ?? 0)) bestOneRM.set(id, e);
        }
      }
    }
    return { lastWorkingSets, bestOneRM, sessions };
  });

  units = $derived(new WeightUnits(this.profile?.usesPounds ?? false));

  activeGym = $derived.by((): Gym => {
    const p = this.profile;
    if (!p) return Gyms.commercial();
    return p.gyms.find((g) => g.id === p.activeGymID) ?? p.gyms[0] ?? Gyms.commercial();
  });

  /** The active program, unless it's finished. */
  activeProgram = $derived.by((): { program: WorkoutProgram; progress: ProgramProgress } | null => {
    const progress = this.profile?.programProgress;
    if (!progress || progress.isFinished) return null;
    const program = Programs.byID(progress.programID);
    return program ? { program, progress } : null;
  });

  async load() {
    try {
      const [profile, logs, kv] = await Promise.all([db.get('profile'), db.get('logs'), db.get('kv')]);
      const p = readProfile(profile);
      // Before anything plans or renders, so saved custom exercises resolve by id.
      if (p) Catalog.setCustom(p.customExercises);
      this.profile = p;
      this.logs = lossy(logs, readLog).sort((a, b) => b.date - a.date);
      this.kv = isObj(kv) ? kv : {};
    } catch (e) {
      console.error('Could not load saved data', e);
    }
    this.ready = true;
    requestPersistence();
  }

  // MARK: Profile

  createProfile(plan: UserPlan, gym: Gym, usesPounds: boolean) {
    this.setProfile({
      plan, gyms: [gym], overrides: [], activeGymID: gym.id, usesPounds, createdAt: Date.now(), customExercises: [],
      programProgress: null,
    });
  }

  setProfile(p: Profile) {
    this.profile = p;
    Catalog.setCustom(p.customExercises);
    db.set('profile', $state.snapshot(p));
  }

  /** Clone, change, save. */
  updateProfile(change: (p: Profile) => void) {
    if (!this.profile) return;
    const next = structuredClone(this.profile);
    change(next);
    this.setProfile(next);
  }

  updatePlan(change: (plan: UserPlan) => void) { this.updateProfile((p) => change(p.plan)); }

  setProgramProgress(progress: ProgramProgress | null) {
    this.updateProfile((p) => { p.programProgress = progress ? structuredClone(progress) : null; });
  }

  /** Marks a logged program day done and moves the program on. */
  completeProgramDay(ref: ProgramRef) {
    this.updateProfile((p) => {
      const progress = p.programProgress;
      const program = progress && Programs.byID(progress.programID);
      if (!progress || !program || progress.programID !== ref.programID) return;
      completeDay(progress, ref.dayID, ref.week, program);
    });
  }

  saveCustomExercise(e: Exercise) {
    this.updateProfile((p) => {
      const i = p.customExercises.findIndex((x) => x.id === e.id);
      if (i >= 0) p.customExercises[i] = e; else p.customExercises.push(e);
    });
  }

  planner(minutes?: number | null): Planner {
    const p = this.profile;
    const plan = { ...(p?.plan ?? defaultPlan()) };
    if (minutes) plan.sessionMinutes = minutes;
    return new Planner({ plan, gym: this.activeGym, history: this.records, overrides: p?.overrides ?? [] });
  }

  /** One loadable step for this exercise at the active gym, in display units. */
  weightStep(e: Exercise): number {
    const pounds = this.units.pounds;
    const eq = loadEquipment(e);
    if (!eq) return pounds ? 5 : 2.5;
    const gym = this.activeGym;
    const step = gymIncrement(gym, eq);
    if (gym.usesPounds === pounds) return step;
    return pounds ? step * POUNDS_PER_KG : step / POUNDS_PER_KG;
  }

  // MARK: Logs

  private saveLogs(next: WorkoutLog[]) {
    this.logs = [...next].sort((a, b) => b.date - a.date);
    db.set('logs', $state.snapshot(this.logs));
  }

  addLog(log: WorkoutLog) { this.saveLogs([log, ...this.logs]); }
  addLogs(logs: WorkoutLog[]) { this.saveLogs([...logs, ...this.logs]); }
  updateLog(log: WorkoutLog) { this.saveLogs(this.logs.map((l) => (l.id === log.id ? log : l))); }
  deleteLog(id: string) { this.saveLogs(this.logs.filter((l) => l.id !== id)); }
  restoreLogs(logs: WorkoutLog[]) { this.saveLogs(logs); }

  // MARK: Small values

  get<T>(key: string): T | undefined { return this.kv[key] as T | undefined; }

  set(key: string, value: unknown) {
    const next = { ...this.kv };
    if (value === undefined) delete next[key]; else next[key] = value;
    this.kv = next;
    db.set('kv', $state.snapshot(next));
  }

  // MARK: Backup

  backup(): string {
    return JSON.stringify({ app: 'forge', version: 1, exportedAt: Date.now(), profile: this.profile, logs: this.logs }, null, 1);
  }

  /** Replaces everything with a backup. Throws if the file isn't one. */
  restore(text: string) {
    const data = JSON.parse(text);
    if (!isObj(data) || data.app !== 'forge') throw new Error("That file isn't a Forge backup.");
    const profile = readProfile(data.profile);
    if (!profile) throw new Error('The backup has no profile.');
    this.setProfile(profile);
    this.saveLogs(lossy(data.logs, readLog));
    this.set('todayPlan', undefined);
  }

  async eraseAll() {
    await db.clear();
    location.reload();
  }
}

export const app = new AppStore();

import {
  Catalog, type DayFocus, type Exercise, type Gym, Gyms, type LoggedExercise, type LoggedSet, Planner, Programs,
  type ProgramProgress, type ProgramRef, type RecoveryOverride, type UserPlan, type WorkoutProgram, type WorkoutRecord,
  completeDay, defaultPlan, lossy, oneRM, readExercise, readGym, readLogged, readOverrides, readPlan, readProgramRef,
  readProgress, uuid, workingSets, loadEquipment, POUNDS_PER_KG, gymIncrement,
} from '../engine';
import { db, requestPersistence } from './db';
import { saving } from './saving.svelte';
import { sync } from './sync.svelte';
import { WeightUnits } from './units';
import { type Activity, readActivity, toExternal } from './activities';
import { prTimeline } from './records';
import { type WorkoutTemplate, readTemplate } from './templates';
import { type BodyweightEntry, readBodyweight } from './bodyweight';

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
  /** Your own sticky note per exercise ("seat on 4", "use the blue band"). */
  exerciseNotes: Record<string, string>;
  /** Lifting workouts you aim for each week (Monday to Sunday). */
  weeklyGoal: number;
  /** Stretches added before and after a workout. */
  mobility: { warmup: boolean; cooldown: boolean };
}

/**
 * Records that grow over time, each in its own store since database version 3. Before that they lived
 * inside the profile, so every weigh-in rewrote the whole profile.
 */
export interface Collections {
  /** Cardio and sport sessions. */
  activities: Activity[];
  /** Weigh-ins. */
  bodyweights: BodyweightEntry[];
  /** Workouts you saved to do again. */
  templates: WorkoutTemplate[];
}
type CollectionName = keyof Collections;
const COLLECTION_NAMES: CollectionName[] = ['activities', 'bodyweights', 'templates'];

const newestFirst = <T extends { date: number }>(xs: T[]) => [...xs].sort((a, b) => b.date - a.date);

/** Reads each collection tolerantly and puts it in display order. */
function readCollections(v: { activities?: unknown; bodyweights?: unknown; templates?: unknown }): Collections {
  return {
    activities: newestFirst(lossy(v.activities, readActivity)),
    bodyweights: newestFirst(lossy(v.bodyweights, readBodyweight)),
    templates: lossy(v.templates, readTemplate).sort((a, b) => b.createdAt - a.createdAt),
  };
}

/** Records with the same id: the first list's copy wins. */
function mergeByID<T extends { id: string }>(first: T[], second: T[]): T[] {
  const ids = new Set(first.map((x) => x.id));
  return [...first, ...second.filter((x) => !ids.has(x.id))];
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
    overrides: readOverrides(v.overrides),
    activeGymID: typeof v.activeGymID === 'string' ? v.activeGymID : safeGyms[0].id,
    usesPounds: typeof v.usesPounds === 'boolean' ? v.usesPounds : false,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now(),
    customExercises: lossy(v.customExercises, readExercise),
    programProgress: readProgress(v.programProgress),
    exerciseNotes: isObj(v.exerciseNotes)
      ? Object.fromEntries(Object.entries(v.exerciseNotes).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== ''))
      : {},
    mobility: {
      warmup: isObj(v.mobility) && typeof v.mobility.warmup === 'boolean' ? v.mobility.warmup : false,
      cooldown: isObj(v.mobility) && typeof v.mobility.cooldown === 'boolean' ? v.mobility.cooldown : false,
    },
    weeklyGoal: typeof v.weeklyGoal === 'number' && v.weeklyGoal >= 1 && v.weeklyGoal <= 7 ? Math.round(v.weeklyGoal) : 3,
  };
}

/**
 * Raw stored records that can go in a store keyed by id: anything that isn't an object is dropped, and
 * one with no id gets a new one. Nothing else is checked, so a record this version can't read is kept
 * for a later version (or a raw export) rather than lost; readers filter it when loading.
 */
function keyable(v: unknown): { id: string }[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((x) => (typeof x.id === 'string' ? (x as { id: string }) : { ...x, id: uuid() }));
}

/** The newest backup layout this version writes; a newer one may hold data this version would drop. */
export const BACKUP_VERSION = 2;

/** A backup file, read and checked, ready to restore. */
export interface Backup {
  profile: Profile;
  logs: WorkoutLog[];
  collections: Collections;
}

/**
 * Reads a backup file. Throws, with a message for the person, if it isn't one, comes from a newer
 * version, or its workouts can't be read: restoring replaces everything, so a backup whose workouts
 * are missing would otherwise wipe them. Reads both layouts: collections beside the profile
 * (version 2) or inside it (version 1).
 */
export function readBackup(text: string): Backup {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("That file isn't a Forge backup."); }
  if (!isObj(data) || data.app !== 'forge') throw new Error("That file isn't a Forge backup.");
  const version = data.version === undefined ? 1 : data.version;
  if (typeof version !== 'number' || !(version >= 1)) throw new Error("That backup's format isn't one Forge knows.");
  if (version > BACKUP_VERSION) throw new Error('That backup is from a newer version of Forge. Update Forge (reopen it from the Home Screen), then restore again.');
  if (!isObj(data.profile)) throw new Error('The backup has no profile.');
  const profile = readProfile(data.profile);
  if (!profile) throw new Error('The backup has no profile.');
  const inProfile = data.profile;
  const rawLogs = Array.isArray(data.logs) ? data.logs : Array.isArray(inProfile.logs) ? inProfile.logs : undefined;
  if (!rawLogs) throw new Error("The backup's workouts are missing, so restoring it would delete yours. Nothing was changed.");
  const logs = lossy(rawLogs, readLog);
  if (rawLogs.length && !logs.length) throw new Error("The backup's workouts couldn't be read. Nothing was changed.");
  const pick = (c: CollectionName) => (Array.isArray(data[c]) ? data[c] : inProfile[c]);
  const collections = readCollections({ activities: pick('activities'), bodyweights: pick('bodyweights'), templates: pick('templates') });
  return { profile, logs, collections };
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
  /**
   * Set when saved data couldn't be read. The app then shows a retry screen, never onboarding,
   * because finishing onboarding would write a new profile over the one that's still on the device.
   */
  loadError = $state<string | null>(null);
  profile = $state.raw<Profile | null>(null);
  /** Newest first. */
  logs = $state.raw<WorkoutLog[]>([]);
  /** Small per-device UI values (today's plan, program day edits, generator day…). */
  kv = $state.raw<Record<string, unknown>>({});
  /** Newest first. */
  activities = $state.raw<Activity[]>([]);
  /** Newest first. */
  bodyweights = $state.raw<BodyweightEntry[]>([]);
  /** Newest created first. */
  templates = $state.raw<WorkoutTemplate[]>([]);

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

  /** Every new best e1RM, newest first. */
  prEvents = $derived(prTimeline(this.logs));

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
      const [profile, stored, legacy, kv, activities, bodyweights, templates] = await Promise.all([
        db.get('profile'), db.allLogs(), db.get('logs'), db.get('kv'), db.all('activities'), db.all('bodyweights'), db.all('templates'),
      ]);
      let collections = readCollections({ activities, bodyweights, templates });
      // Before version 3, cardio, weigh-ins and saved workouts lived inside the profile; move them out once.
      if (isObj(profile) && COLLECTION_NAMES.some((c) => c in profile)) collections = await this.moveOutOfProfile(profile, collections);
      let logs: unknown[] = stored;
      // Before version 2 every workout lived in one list under 'logs'; move them to their own store once,
      // in one transaction so an interrupted move can't leave them in both places. A workout already in
      // the store (an earlier move that half happened) keeps the store's copy.
      if (Array.isArray(legacy)) {
        const ids = new Set(keyable(stored).map((x) => x.id));
        const moved = keyable(legacy).filter((x) => !ids.has(x.id));
        await db.moveLegacyLogs(moved);
        logs = [...stored, ...moved];
      }
      const p = readProfile(profile);
      if (profile !== undefined && profile !== null && !p) throw new Error('The saved profile is unreadable.');
      // Before anything plans or renders, so saved custom exercises resolve by id.
      if (p) Catalog.setCustom(p.customExercises);
      this.profile = p;
      this.logs = lossy(logs, readLog).sort((a, b) => b.date - a.date);
      this.kv = isObj(kv) ? kv : {};
      this.setCollections(collections);
      this.loadError = null;
    } catch (e) {
      console.error('Could not load saved data', e);
      this.loadError = e instanceof Error ? e.message : String(e);
    }
    this.ready = true;
    requestPersistence();
  }

  /**
   * After a load error the user chose to get past: reads whatever can still be read and shows
   * onboarding, which writes a new profile. Workouts are in their own store, so they're kept.
   */
  async resetAfterLoadError() {
    this.loadError = null;
    this.ready = false;
    try {
      const [stored, kv, activities, bodyweights, templates] = await Promise.all([
        db.allLogs(), db.get('kv'), db.all('activities'), db.all('bodyweights'), db.all('templates'),
      ]);
      this.logs = lossy(stored, readLog).sort((a, b) => b.date - a.date);
      this.kv = isObj(kv) ? kv : {};
      this.setCollections(readCollections({ activities, bodyweights, templates }));
    } catch (e) {
      console.error('Could not read workouts', e);
    }
    this.profile = null;
    this.ready = true;
  }

  /**
   * Moves the collections out of a version 2 profile into their own stores, in one transaction with
   * the slimmed profile, and returns them merged with anything already in the stores.
   */
  private async moveOutOfProfile(raw: Raw, stored: Collections): Promise<Collections> {
    // The raw entries move, not just the ones this version can read, so none are lost on the way.
    const rawMoved = Object.fromEntries(COLLECTION_NAMES.map((c) => [c, keyable(raw[c])]));
    const fromProfile = readCollections(rawMoved);
    const slim = Object.fromEntries(Object.entries(raw).filter(([k]) => !COLLECTION_NAMES.includes(k as CollectionName)));
    await db.moveIntoCollections(slim, rawMoved);
    return {
      activities: newestFirst(mergeByID(stored.activities, fromProfile.activities)),
      bodyweights: newestFirst(mergeByID(stored.bodyweights, fromProfile.bodyweights)),
      templates: mergeByID(stored.templates, fromProfile.templates).sort((a, b) => b.createdAt - a.createdAt),
    };
  }

  private setCollections(c: Collections) {
    this.activities = c.activities;
    this.bodyweights = c.bodyweights;
    this.templates = c.templates;
  }

  // MARK: Profile

  createProfile(plan: UserPlan, gym: Gym, usesPounds: boolean, weeklyGoal = 3) {
    this.setProfile({
      plan, gyms: [gym], overrides: [], activeGymID: gym.id, usesPounds, createdAt: Date.now(), customExercises: [],
      programProgress: null, exerciseNotes: {}, weeklyGoal, mobility: { warmup: false, cooldown: false },
    });
  }

  setProfile(p: Profile) {
    this.profile = p;
    Catalog.setCustom(p.customExercises);
    const snap = $state.snapshot(p);
    return saving.run('profile', () => db.set('profile', snap));
  }

  /**
   * Clone, change, save. If another copy of Forge saved since this one loaded, the change is applied
   * to the stored profile instead of writing this copy's older one over it.
   */
  updateProfile(change: (p: Profile) => void) {
    if (!this.profile) return;
    const next = structuredClone(this.profile);
    change(next);
    if (!sync.stale) return this.setProfile(next);
    this.profile = next;
    Catalog.setCustom(next.customExercises);
    const fallback = $state.snapshot(next);
    return saving.run('profile', () => db.update('profile', (stored) => {
      const base = readProfile(stored);
      if (!base) return fallback;
      change(base);
      return $state.snapshot(base);
    }));
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

  /** Logged activities in the form the recovery model reads. */
  external = $derived(toExternal(this.activities));

  // Each writes just the one record it touches, and resolves to whether it reached the device.
  private putRecord(c: CollectionName, item: { id: string }) {
    const snap = $state.snapshot(item);
    return saving.run(`${c}:${item.id}`, () => db.put(c, [snap]));
  }
  private deleteRecord(c: CollectionName, id: string) {
    return saving.run(`${c}:${id}`, () => db.delete(c, id));
  }

  addActivity(a: Activity) {
    this.activities = newestFirst([a, ...this.activities.filter((x) => x.id !== a.id)]);
    return this.putRecord('activities', a);
  }

  removeActivity(id: string) {
    this.activities = this.activities.filter((x) => x.id !== id);
    return this.deleteRecord('activities', id);
  }

  addBodyweight(e: BodyweightEntry) {
    this.bodyweights = newestFirst([e, ...this.bodyweights.filter((x) => x.id !== e.id)]);
    return this.putRecord('bodyweights', e);
  }

  removeBodyweight(id: string) {
    this.bodyweights = this.bodyweights.filter((x) => x.id !== id);
    return this.deleteRecord('bodyweights', id);
  }

  saveTemplate(t: WorkoutTemplate) {
    this.templates = [t, ...this.templates.filter((x) => x.id !== t.id)].sort((a, b) => b.createdAt - a.createdAt);
    return this.putRecord('templates', t);
  }

  removeTemplate(id: string) {
    this.templates = this.templates.filter((x) => x.id !== id);
    return this.deleteRecord('templates', id);
  }

  setExerciseNote(id: string, text: string) {
    this.updateProfile((p) => { if (text.trim()) p.exerciseNotes[id] = text.trim(); else delete p.exerciseNotes[id]; });
  }

  planner(minutes?: number | null): Planner {
    const p = this.profile;
    const plan = { ...(p?.plan ?? defaultPlan()) };
    if (minutes) plan.sessionMinutes = minutes;
    return new Planner({ plan, gym: this.activeGym, history: this.records, overrides: p?.overrides ?? [], external: this.external });
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

  private setLogs(next: WorkoutLog[]) { this.logs = [...next].sort((a, b) => b.date - a.date); }

  // Each change writes only the workouts it touches.
  // Each resolves to whether it reached the device.
  addLog(log: WorkoutLog) { return this.addLogs([log]); }
  addLogs(logs: WorkoutLog[]) {
    const ids = new Set(logs.map((l) => l.id));
    this.setLogs([...logs, ...this.logs.filter((l) => !ids.has(l.id))]);
    const snap = $state.snapshot(logs);
    // One write for all of them, but a failure is retried per workout, so deleting or editing one of
    // them afterwards replaces its retry rather than the old batch bringing it back.
    return saving.runBatch(logs.map((l) => `log:${l.id}`), () => db.putLogs(snap), (i) => () => db.putLogs([snap[i]]));
  }
  updateLog(log: WorkoutLog) {
    this.setLogs(this.logs.map((l) => (l.id === log.id ? log : l)));
    const snap = $state.snapshot(log);
    return saving.run(`log:${log.id}`, () => db.putLogs([snap]));
  }
  deleteLog(id: string) {
    this.setLogs(this.logs.filter((l) => l.id !== id));
    return saving.run(`log:${id}`, () => db.deleteLog(id));
  }
  /** Takes back a workout whose save failed, so trying again doesn't add it twice. */
  dropUnsavedLog(id: string) {
    this.setLogs(this.logs.filter((l) => l.id !== id));
    saving.forget(`log:${id}`);
  }
  /** Replaces every workout (restoring a backup). */
  restoreLogs(logs: WorkoutLog[]) {
    this.setLogs(logs);
    saving.forget('log:');
    const snap = $state.snapshot(logs);
    return saving.run('log:*', () => db.replaceLogs(snap));
  }

  // MARK: Small values

  get<T>(key: string): T | undefined { return this.kv[key] as T | undefined; }

  set(key: string, value: unknown) {
    const next = { ...this.kv };
    if (value === undefined) delete next[key]; else next[key] = value;
    this.kv = next;
    // Writes just this key into what's stored, so another copy of Forge's other values aren't
    // overwritten with this copy's older ones, and each key's failed save is retried on its own.
    const snap = $state.snapshot(value);
    saving.run(`kv:${key}`, () => db.update('kv', (stored) => {
      const kv = isObj(stored) ? { ...stored } : {};
      if (snap === undefined) delete kv[key]; else kv[key] = snap;
      return kv;
    }));
  }

  // MARK: Backup

  /** Version 2 keeps the collections beside the profile, as the database does. */
  backup(): string {
    return JSON.stringify({
      app: 'forge', version: 2, exportedAt: Date.now(), profile: this.profile, logs: this.logs,
      activities: this.activities, bodyweights: this.bodyweights, templates: this.templates,
    }, null, 1);
  }

  /** Replaces everything with a backup (a file's text, or one already read with `readBackup`). Throws if it can't be read. */
  restore(backup: string | Backup) {
    const { profile, logs, collections } = typeof backup === 'string' ? readBackup(backup) : backup;
    this.setProfile(profile);
    this.restoreLogs(logs);
    this.setCollections(collections);
    for (const c of COLLECTION_NAMES) {
      saving.forget(`${c}:`);
      const snap = $state.snapshot(collections[c]);
      saving.run(`${c}:*`, () => db.replace(c, snap));
    }
    this.set('todayPlan', undefined);
  }

  async eraseAll() {
    await db.clear();
    location.reload();
  }
}

export const app = new AppStore();

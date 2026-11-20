import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Bug hunt batch 3 (shell, storage and wording): U19, U22, U25–U27, U29, U30, U12, U11, S15, S17–S22.
// Persistence is a no-op here.
vi.mock('./db', () => ({
  db: { get: vi.fn(async () => undefined), set: async () => {}, del: async () => {}, update: async () => {}, put: async () => {}, delete: async () => {}, replace: async () => {}, all: async () => [], allLogs: async () => [], putLogs: async () => {}, deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: async () => false,
}));
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

const { Catalog, Gyms, defaultPlan, parseCSV, parseHistory, readGym, readSet } = await import('../engine');
const { app, restoreGym } = await import('./store.svelte');
const { toasts } = await import('./toasts.svelte');
const { backupDue, saveFile, unsavedCount } = await import('./backup');
const { logTitle } = await import('./logs');
const { count } = await import('./labels');
const { workoutLog } = await import('./finishWorkout');
const { clock, startOfDay } = await import('./clock.svelte');
const { updates, SNOOZE_MS } = await import('./pwa.svelte');
type WorkoutLog = import('./store.svelte').WorkoutLog;

const DAY = 86_400_000;
const log = (id: string, date: number, o: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id, date, focus: 'push', durationSeconds: 3000, program: null,
  exercises: [{ exerciseID: 'bb-bench', targetReps: 6, slotID: null, repRange: null, targetRIR: null, sets: [{ weight: 100, reps: 6, rir: 2, isWarmup: false, side: null }] }],
  ...o,
});

beforeEach(() => {
  app.createProfile(defaultPlan(), Gyms.commercial(), false);
  app.restoreLogs([]);
  for (const k of ['lastBackupAt', 'backupLogCount', 'backupLogIDs', 'backupSnoozeUntil']) app.set(k, undefined);
});

describe('Toasts (U22)', () => {
  beforeEach(() => { vi.useFakeTimers(); toasts.items = []; });
  afterEach(() => vi.useRealTimers());

  test('a second undoable toast keeps the first one\'s Undo', () => {
    const undoA = vi.fn(), undoB = vi.fn();
    const a = toasts.show('Workout deleted', undoA);
    toasts.show('Workout deleted', undoB);
    expect(toasts.items).toHaveLength(2);
    toasts.performUndo(a);
    expect(undoA).toHaveBeenCalledOnce();
    expect(undoB).not.toHaveBeenCalled();
    expect(toasts.items).toHaveLength(1);
  });

  test('a plain toast (the swipe hint) doesn\'t replace an Undo', () => {
    const undo = vi.fn();
    toasts.show('Workout discarded', undo);
    toasts.show('Swipe to move between exercises');
    expect(toasts.items.map((t) => t.message)).toEqual(['Workout discarded', 'Swipe to move between exercises']);
    toasts.performUndo();
    expect(undo).toHaveBeenCalledOnce();
  });

  test('each toast times out on its own; the same plain message doesn\'t stack', () => {
    toasts.show('Undoable', () => {});
    toasts.show('Still not saving');
    toasts.show('Still not saving');
    expect(toasts.items).toHaveLength(2);
    vi.advanceTimersByTime(3100);
    expect(toasts.items.map((t) => t.message)).toEqual(['Undoable']);
    vi.advanceTimersByTime(4000);
    expect(toasts.items).toEqual([]);
  });

  test('a burst keeps Undos over plain confirmations', () => {
    toasts.show('Saved');
    for (const m of ['A', 'B', 'C']) toasts.show(m, () => {});
    expect(toasts.items.map((t) => t.message)).toEqual(['A', 'B', 'C']);
  });
});

describe('Backup nudge counting (U25, S15)', () => {
  test('deleting some workouts and logging as many new ones still counts the new ones', () => {
    const now = 100 * DAY;
    app.restoreLogs(Array.from({ length: 10 }, (_, i) => log(`old${i}`, i * DAY)));
    app.set('lastBackupAt', 50 * DAY);
    app.set('backupLogIDs', app.logs.map((l) => l.id));
    app.set('backupLogCount', 10);
    expect(unsavedCount()).toBe(0);
    for (const id of ['old0', 'old1', 'old2']) app.deleteLog(id);
    for (const id of ['new0', 'new1', 'new2']) app.addLog(log(id, 60 * DAY));
    expect(app.logs).toHaveLength(10);
    expect(unsavedCount()).toBe(3);
    expect(backupDue(now)).toBe(true);
  });

  test('backups made before ids were kept still fall back to the count', () => {
    app.restoreLogs(Array.from({ length: 5 }, (_, i) => log(`l${i}`, i * DAY)));
    app.set('lastBackupAt', 1);
    app.set('backupLogCount', 3);
    expect(unsavedCount()).toBe(2);
  });

  test('the copy is pluralised', () => {
    expect(count(1, 'new workout')).toBe('1 new workout');
    expect(count(3, 'new workout')).toBe('3 new workouts');
    expect(count(1, 'piece of equipment', 'pieces of equipment')).toBe('1 piece of equipment');
  });
});

describe('Saving a backup file (U27, S15)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const file = () => new File(['{}'], 'b.json', { type: 'application/json' });
  const stubShare = (error: string, standalone: boolean) => {
    vi.stubGlobal('navigator', { canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: error }); }, standalone });
    vi.stubGlobal('matchMedia', () => ({ matches: standalone }));
  };

  test('from the Home Screen, a share that fails isn\'t counted as saved', async () => {
    stubShare('NotAllowedError', true);
    expect(await saveFile(file())).toBe(false);
  });

  test('cancelling the share sheet isn\'t saved either', async () => {
    stubShare('AbortError', false);
    expect(await saveFile(file())).toBe(false);
  });
});

describe('Workout titles (U19, S21)', () => {
  test('match what Today calls the day', () => {
    expect(logTitle(log('a', 1, { focus: 'upper' }))).toBe('Upper Body');
    expect(logTitle(log('a', 1, { focus: 'fullBody' }))).toBe('Full Body');
    expect(logTitle(log('a', 1, { focus: 'recovered' }))).toBe('Recovered Muscles');
    expect(logTitle(log('a', 1, { focus: 'push' }))).toBe('Push Day');
    expect(logTitle(log('a', 1, { focus: null }))).toBe('Workout');
  });

  test('a saved workout keeps its name in History', () => {
    const state = { startedAt: 1000, focus: null, currentIndex: 0, title: 'Arm Day', exercises: [
      { id: 'x', exerciseID: 'bb-bench', sets: [{ id: 's', weight: 60, reps: 8, done: true, isWarmup: false }] },
    ] } as unknown as Parameters<typeof workoutLog>[0];
    const saved = workoutLog(state, 'l1', 5000)!;
    expect(saved.title).toBe('Arm Day');
    app.restoreLogs([saved]);
    expect(logTitle(app.logs[0])).toBe('Arm Day');
  });

  test('an unknown focus reads as none, not "undefined Day"', () => {
    app.restore(JSON.stringify({ app: 'forge', version: 2, profile: { usesPounds: false }, logs: [{ ...log('a', 1), focus: 'cardioDay' }] }));
    expect(app.logs[0].focus).toBeNull();
    expect(logTitle(app.logs[0])).toBe('Workout');
  });
});

describe('Gyms and sets as stored (S17, S18, S19)', () => {
  test('Undo after deleting a gym keeps edits made to other gyms since', () => {
    const p = structuredClone(app.profile!);
    const a = { ...Gyms.home(), id: 'a', name: 'A' }, b = { ...Gyms.home(), id: 'b', name: 'B' }, c = { ...Gyms.home(), id: 'c', name: 'C' };
    p.gyms = [a, b, c];
    p.activeGymID = 'b';
    // Delete B (active falls back to A), then rename C.
    p.gyms = [a, c];
    p.activeGymID = 'a';
    p.gyms[1] = { ...c, name: 'C renamed' };
    restoreGym(p, b, 1, true);
    expect(p.gyms.map((g) => g.name)).toEqual(['A', 'B', 'C renamed']);
    expect(p.activeGymID).toBe('b');
  });

  test('a gym stored without an id gets the same id on every read', () => {
    app.restore(JSON.stringify({ app: 'forge', version: 2, profile: { usesPounds: false, gyms: [{ name: 'Garage', equipment: ['dumbbell'] }] }, logs: [] }));
    const first = app.profile!.gyms[0].id;
    app.restore(JSON.stringify({ app: 'forge', version: 2, profile: { usesPounds: false, gyms: [{ name: 'Garage', equipment: ['dumbbell'] }] }, logs: [] }));
    expect(app.profile!.gyms[0].id).toBe(first);
    expect(readGym({ name: 'x' }, 'gym-1')!.id).toBe('gym-1');
  });

  test('absurd weight steps and negative sets are ignored', () => {
    const g = readGym({ id: 'g', name: 'G', increments: { dumbbell: 1e9, barbell: 2.5 } })!;
    expect(g.increments).toEqual({ barbell: 2.5 });
    const s = readSet({ weight: -50, reps: -3 })!;
    expect(s.weight).toBe(0);
    expect(s.reps).toBe(0);
  });
});

describe('CSV parsing gaps (S22)', () => {
  const now = new Date(2025, 5, 1).getTime();
  test('old Mac CR-only line endings split into rows', () => {
    expect(parseCSV('a,b\rc,d\r')).toEqual([['a', 'b'], ['c', 'd']]);
    const r = parseHistory('Date,Exercise,Reps,Weight(kg)\r2024-01-15,Bench Press (Barbell),5,100\r', false, {}, Catalog.all, now);
    expect(r.workouts).toHaveLength(1);
  });

  test('a "Weight Unit" column before "Weight" doesn\'t zero every weight, and its unit is used', () => {
    const r = parseHistory('Date,Exercise,Reps,Weight Unit,Weight\n2024-01-15,Bench Press (Barbell),5,kg,100\n', true, {}, Catalog.all, now);
    expect(r.workouts[0].exercises[0].sets[0].weight).toBe(100);
  });
});

describe('Stale dates (U30)', () => {
  test('the clock moves to the new day only when the day changes', () => {
    const day = new Date(2026, 0, 10, 23, 59).getTime();
    clock.refresh(day);
    const before = clock.today;
    expect(before).toBe(startOfDay(day));
    clock.refresh(day + 30_000);
    expect(clock.today).toBe(before);
    clock.refresh(day + 2 * 60_000);
    expect(clock.today).toBe(startOfDay(day + 2 * 60_000));
    expect(clock.today).not.toBe(before);
  });
});

describe('Update banner "Later" (U26)', () => {
  test('a version already waiting is offered again once the snooze is over', () => {
    const reg = { waiting: {} as ServiceWorker, update: async () => {} };
    updates.ready = true;
    updates.later(1000);
    expect(updates.ready).toBe(false);
    updates.cameBack(reg, 1000 + 60_000);
    expect(updates.ready).toBe(false);
    updates.cameBack(reg, 1000 + SNOOZE_MS);
    expect(updates.ready).toBe(true);
  });

  test('nothing waiting, nothing offered', () => {
    updates.ready = false;
    updates.later(0);
    updates.cameBack({ waiting: null, update: async () => {} }, SNOOZE_MS * 2);
    expect(updates.ready).toBe(false);
  });
});

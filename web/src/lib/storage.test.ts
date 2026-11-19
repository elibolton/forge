// Regression tests for the storage fixes from the bug hunt (docs/bug-hunt/storage.md 1–5, 14, 16).
// Each scenario starts from a freshly seeded in-memory database.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';

const DAY = 86_400_000;
const mkLog = (id: string, day: number) => ({
  id, date: day * DAY, focus: 'push', durationSeconds: 3000, program: null,
  exercises: [{ exerciseID: 'bb-bench', targetReps: 6, slotID: null, repRange: null, targetRIR: null, sets: [{ weight: 100, reps: 6, rir: 2, isWarmup: false, side: null }] }],
});
const profile = { usesPounds: false, createdAt: 1, weeklyGoal: 4 };

const { db } = await import('./db');
const { app, readBackup } = await import('./store.svelte');
const { saving } = await import('./saving.svelte');
const { sync } = await import('./sync.svelte');

/** Wipes the database (the app's open connection steps aside) and writes `version`-3 stores with `put`. */
async function seed(kv: Record<string, unknown>, logs: object[] = [], version = 3) {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('forge');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  const d = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('forge', version);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      for (const c of version >= 3 ? ['logs', 'activities', 'bodyweights', 'templates'] : ['logs']) req.result.createObjectStore(c, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction(['kv', 'logs'], 'readwrite');
    for (const [k, v] of Object.entries(kv)) t.objectStore('kv').put(v, k);
    for (const l of logs) t.objectStore('logs').put(l);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  d.close();
  await app.load();
}

const ids = (xs: unknown[]) => xs.map((x) => (x as { id: string }).id).sort();
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => { sync.stale = false; });

describe('Restoring a backup (S1)', () => {
  beforeEach(() => seed({ profile }, [mkLog('a', 1), mkLog('b', 2), mkLog('c', 3)]));

  test('a backup with no workouts section is refused and nothing changes', async () => {
    const text = JSON.stringify({ app: 'forge', version: 2, profile: { usesPounds: true } });
    expect(() => readBackup(text)).toThrow(/workouts are missing/);
    expect(() => app.restore(text)).toThrow();
    await settle();
    expect(app.logs.length).toBe(3);
    expect((await db.allLogs()).length).toBe(3);
    expect(app.profile!.usesPounds).toBe(false);
  });

  test('a backup whose workouts are all unreadable is refused', () => {
    const text = JSON.stringify({ app: 'forge', version: 2, profile, logs: [{ nope: 1 }, 'x'] });
    expect(() => readBackup(text)).toThrow(/couldn't be read/);
  });

  test('a backup from a newer version is refused', () => {
    const text = JSON.stringify({ app: 'forge', version: 3, profile, logs: [mkLog('z', 9)] });
    expect(() => readBackup(text)).toThrow(/newer version/);
  });

  test('a version 1 backup with its workouts inside the profile restores them', async () => {
    const text = JSON.stringify({ app: 'forge', version: 1, profile: { ...profile, logs: [mkLog('v1', 5)] } });
    expect(readBackup(text).logs.map((l) => l.id)).toEqual(['v1']);
    app.restore(text);
    await settle();
    expect(ids(await db.allLogs())).toEqual(['v1']);
  });

  test('an empty workouts list is a real (if empty) backup: it reads, and the screen asks before using it', () => {
    const b = readBackup(JSON.stringify({ app: 'forge', version: 2, profile, logs: [] }));
    expect(b.logs).toEqual([]);
  });
});

describe('Retrying a failed batch save (S2)', () => {
  beforeEach(() => seed({ profile }));

  test('deleting one workout of a failed batch keeps it deleted after Try Again', async () => {
    const put = db.putLogs;
    db.putLogs = () => Promise.reject(new Error('disk full'));
    expect(await app.addLogs([mkLog('x', 1), mkLog('y', 2)] as never)).toBe(false);
    db.putLogs = put;
    await app.deleteLog('x');
    expect(await saving.retry()).toBe(true);
    expect(app.logs.map((l) => l.id)).toEqual(['y']);
    expect(ids(await db.allLogs())).toEqual(['y']);
  });

  test('editing one workout of a failed batch keeps the edit after Try Again', async () => {
    const put = db.putLogs;
    db.putLogs = () => Promise.reject(new Error('disk full'));
    await app.addLogs([mkLog('x', 1), mkLog('y', 2)] as never);
    db.putLogs = put;
    await app.updateLog({ ...mkLog('x', 1), durationSeconds: 99 } as never);
    expect(await saving.retry()).toBe(true);
    const stored = (await db.allLogs()) as { id: string; durationSeconds: number }[];
    expect(stored.find((l) => l.id === 'x')!.durationSeconds).toBe(99);
    expect(ids(stored)).toEqual(['x', 'y']);
  });
});

describe('Moving the pre-version-2 workout list (S3)', () => {
  test('a workout in both the store and the old list (an interrupted move) shows once', async () => {
    await seed({ profile, logs: [mkLog('L1', 1), mkLog('L2', 2)] }, [mkLog('L1', 1)]);
    expect(app.logs.map((l) => l.id).sort()).toEqual(['L1', 'L2']);
    expect(ids(await db.allLogs())).toEqual(['L1', 'L2']);
    expect(await db.get('logs')).toBeUndefined();
  });

  test('a listed workout with no id keeps the one it was given; loading again adds nothing', async () => {
    const { id: _, ...noID } = mkLog('', 4);
    await seed({ profile, logs: [noID] });
    expect(app.logs.length).toBe(1);
    await app.load();
    expect(app.logs.length).toBe(1);
    expect((await db.allLogs()).length).toBe(1);
  });
});

describe('Moving collections out of a version 2 profile (S16)', () => {
  test('entries this version can\'t read are moved too, just not shown', async () => {
    const zero = { id: 'act-0', kind: 'run', date: DAY, minutes: 0 };
    const ok = { id: 'act-1', kind: 'run', date: 2 * DAY, minutes: 30 };
    const light = { id: 'bw-0', date: DAY, kg: 5 };
    await seed({ profile: { ...profile, activities: [zero, ok], bodyweights: [light] } }, [], 2);
    expect(app.activities.map((a) => a.id)).toEqual(['act-1']);
    expect(app.bodyweights).toEqual([]);
    expect(ids(await db.all('activities'))).toEqual(['act-0', 'act-1']);
    expect(await db.all('bodyweights')).toEqual([light]);
    expect(Object.keys((await db.get('profile')) as object)).not.toContain('activities');
  });
});

describe('Two copies of Forge open at once (S5)', () => {
  beforeEach(() => seed({ profile, kv: { restSound: 'chime' } }));

  test('a setting saved here writes just its key, keeping a key another copy saved', async () => {
    await db.set('kv', { restSound: 'chime', todayPlan: { from: 'other tab' } });
    app.set('restSound', 'bell');
    await settle();
    expect(await db.get('kv')).toEqual({ restSound: 'bell', todayPlan: { from: 'other tab' } });
  });

  test('once out of date, a profile change lands on the stored profile instead of over it', async () => {
    await db.set('profile', { ...profile, weeklyGoal: 6 });
    sync.stale = true;
    app.updateProfile((p) => { p.usesPounds = true; });
    await settle();
    const stored = (await db.get('profile')) as { weeklyGoal: number; usesPounds: boolean };
    expect(stored.weeklyGoal).toBe(6);
    expect(stored.usesPounds).toBe(true);
    expect(app.profile!.usesPounds).toBe(true);
  });
});

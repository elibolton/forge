// The database itself, on an in-memory IndexedDB: upgrading a version 2 database, moving cardio,
// weigh-ins and saved workouts out of the profile, and backups in both layouts.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'vitest';

const DAY = 86_400_000;
const run = { id: 'act-1', kind: 'run', date: 3 * DAY, minutes: 30 };
const walk = { id: 'act-2', kind: 'walk', date: 5 * DAY, minutes: 45 };
const weighIn = { id: 'bw-1', date: 4 * DAY, kg: 82.5 };
const template = { id: 'tpl-1', name: 'Push A', createdAt: 2 * DAY, exercises: [{ exerciseID: 'bb-bench', sets: 4, reps: 6 }] };
const log = {
  id: 'log-1', date: 6 * DAY, focus: 'push', durationSeconds: 3000, program: null,
  exercises: [{ exerciseID: 'bb-bench', targetReps: 6, slotID: null, repRange: null, targetRIR: null, sets: [{ weight: 100, reps: 6, rir: 2, isWarmup: false, side: null }] }],
};

/** A database as version 2 of the app left it: the collections inside the profile. */
async function seedVersion2() {
  const d = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('forge', 2);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); req.result.createObjectStore('logs', { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction(['kv', 'logs'], 'readwrite');
    t.objectStore('kv').put({ usesPounds: false, createdAt: 1, weeklyGoal: 4, activities: [run, walk], bodyweights: [weighIn], templates: [template] }, 'profile');
    t.objectStore('logs').put(log);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  d.close();
}

const { db } = await import('./db');
const { app } = await import('./store.svelte');

beforeAll(async () => {
  await seedVersion2();
  await app.load();
});

describe('Upgrading from version 2', () => {
  test('cardio, weigh-ins and saved workouts move to their own stores, newest first', async () => {
    expect(app.loadError).toBeNull();
    expect(app.activities.map((a) => a.id)).toEqual(['act-2', 'act-1']);
    expect(app.bodyweights).toEqual([weighIn]);
    expect(app.templates.map((t) => t.id)).toEqual(['tpl-1']);
    expect((await db.all('activities')).length).toBe(2);
    expect(await db.all('bodyweights')).toEqual([weighIn]);
    expect((await db.all('templates')).length).toBe(1);
  });

  test('the saved profile no longer carries them; everything else stays', async () => {
    const profile = (await db.get('profile')) as Record<string, unknown>;
    expect(Object.keys(profile)).not.toContain('activities');
    expect(Object.keys(profile)).not.toContain('bodyweights');
    expect(Object.keys(profile)).not.toContain('templates');
    expect(profile.weeklyGoal).toBe(4);
    expect(app.profile!.weeklyGoal).toBe(4);
    expect(app.logs.map((l) => l.id)).toEqual(['log-1']);
  });

  test('loading again changes nothing', async () => {
    await app.load();
    expect(app.activities.length).toBe(2);
    expect(app.bodyweights.length).toBe(1);
    expect(app.templates.length).toBe(1);
  });

  test('recovery still counts the moved cardio', () => {
    expect(app.external.length).toBe(2);
  });
});

describe('Writing one record', () => {
  test('a weigh-in writes its own store and leaves the profile alone', async () => {
    const before = await db.get('profile');
    expect(await app.addBodyweight({ id: 'bw-2', date: 7 * DAY, kg: 82 })).toBe(true);
    expect((await db.all('bodyweights')).length).toBe(2);
    expect(app.bodyweights[0].id).toBe('bw-2');
    expect(await db.get('profile')).toEqual(before);
  });

  test('removing a record deletes just that one', async () => {
    expect(await app.removeActivity('act-1')).toBe(true);
    expect((await db.all('activities')).map((a) => (a as { id: string }).id)).toEqual(['act-2']);
    expect(await app.saveTemplate({ ...template, name: 'Push A (heavy)' })).toBe(true);
    expect(((await db.all('templates'))[0] as { name: string }).name).toBe('Push A (heavy)');
  });
});

describe('Backups', () => {
  test('a backup restores to the same data', async () => {
    const text = app.backup();
    expect(JSON.parse(text).version).toBe(2);
    await app.removeBodyweight('bw-1');
    app.restore(text);
    expect(app.bodyweights.map((b) => b.id).sort()).toEqual(['bw-1', 'bw-2']);
    await new Promise((r) => setTimeout(r, 20));
    expect((await db.all('bodyweights')).length).toBe(2);
  });

  test('an older backup, with everything inside the profile, still restores', async () => {
    const old = JSON.stringify({
      app: 'forge', version: 1, profile: { weeklyGoal: 2, activities: [run], bodyweights: [], templates: [template] }, logs: [log],
    });
    app.restore(old);
    expect(app.profile!.weeklyGoal).toBe(2);
    expect(app.activities.map((a) => a.id)).toEqual(['act-1']);
    expect(app.bodyweights).toEqual([]);
    expect(app.templates.map((t) => t.id)).toEqual(['tpl-1']);
    await new Promise((r) => setTimeout(r, 20));
    expect((await db.all('activities')).length).toBe(1);
    expect(await db.all('bodyweights')).toEqual([]);
    expect(Object.keys((await db.get('profile')) as object)).not.toContain('activities');
  });
});

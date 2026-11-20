// Two phones syncing through a real PocketBase. Runs only when PB_URL points at a throwaway server
// with the Forge migrations (server/tests/run.sh starts one and sets it); skipped otherwise.
import { IDBFactory } from 'fake-indexeddb';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const PB = process.env.PB_URL;
const SU = { identity: 'admin@test.local', password: 'testpassword123' };

type Phone = {
  db: typeof import('./db').db;
  sync: () => Promise<{ pulled: number; pushed: number }>;
};

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(PB + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
}

/** A fresh phone: its own IndexedDB and its own copy of the modules, signed in as `token`. */
async function phone(account: { id: string; email: string }, token: string): Promise<Phone> {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  const { db } = await import('./db');
  await db.get('profile'); // opens this phone's database now, before the next phone swaps the factory
  const { syncPass } = await import('./syncEngine');
  const { Server } = await import('./server');
  const server = new Server(PB);
  let cursors = {};
  const session = { token, account, refreshedAt: Date.now() };
  return {
    db,
    sync: async () => { const r = await syncPass(server, session, cursors); cursors = r.cursors; return r; },
  };
}

const log = (id: string, reps: number) => ({ id, date: 1_700_000_000_000, focus: 'push', durationSeconds: 1800, program: null,
  exercises: [{ exerciseID: 'bb-bench', sets: [{ weight: 100, reps, rir: 2, isWarmup: false, side: null }] }] });
const reps = async (p: Phone, id: string) => ((await p.db.readSynced('logs', id)) as ReturnType<typeof log> | undefined)?.exercises[0].sets[0].reps;

describe.skipIf(!PB)('sync between two phones', () => {
  let account: { id: string; email: string };
  let token: string;
  let a: Phone;
  let b: Phone;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_800_000_000_000);
    const su = (await call('POST', '/api/collections/_superusers/auth-with-password', undefined, SU)).token;
    await call('POST', '/api/collections/invites/records', su, { code: 'SYNCTEST', maxUses: 1, uses: 0 });
    await call('POST', '/api/forge/join', undefined, { email: 'sync@test.local', code: 'SYNCTEST' });
    const users = await call('GET', `/api/collections/users/records?filter=${encodeURIComponent("email='sync@test.local'")}`, su);
    account = { id: users.items[0].id, email: 'sync@test.local' };
    token = (await call('POST', `/api/collections/users/impersonate/${account.id}`, su, {})).token;
  });
  afterAll(() => { vi.useRealTimers(); });

  test("phone A's existing data uploads on first sign-in", async () => {
    a = await phone(account, token);
    await a.db.set('profile', { usesPounds: true, gyms: [] });
    await a.db.put('logs', [log('w1', 5), log('w2', 6)]);
    await a.db.set('kv', { todayPlan: 'device-only' });
    await a.db.queueEverything();
    const r = await a.sync();
    expect(r.pushed).toBe(3);
    expect(await a.db.outboxCount()).toBe(0);
  });

  test('phone B signs in and gets it all, but not device-only values', async () => {
    b = await phone(account, token);
    await b.db.queueEverything();
    const r = await b.sync();
    expect(r.pulled).toBe(3);
    expect(await reps(b, 'w1')).toBe(5);
    expect(await b.db.get('profile')).toEqual({ usesPounds: true, gyms: [] });
    expect(await b.db.get('kv')).toBeUndefined();
  });

  test('an edit on B reaches A; a delete on A reaches B', async () => {
    vi.setSystemTime(1_800_000_100_000);
    await b.db.put('logs', [log('w1', 8)]);
    expect((await b.sync()).pushed).toBe(1);
    expect((await a.sync()).pulled).toBe(1);
    expect(await reps(a, 'w1')).toBe(8);

    vi.setSystemTime(1_800_000_200_000);
    await a.db.delete('logs', 'w2');
    await a.sync();
    await b.sync();
    expect(await b.db.readSynced('logs', 'w2')).toBeUndefined();
  });

  test('a phone that missed a newer change cannot overwrite it', async () => {
    // A edits at t=300, B edits the same workout earlier (t=250) while offline, then A syncs first.
    vi.setSystemTime(1_800_000_250_000);
    await b.db.put('logs', [log('w1', 3)]);
    vi.setSystemTime(1_800_000_300_000);
    await a.db.put('logs', [log('w1', 12)]);
    await a.sync();
    await b.sync();
    expect(await reps(b, 'w1')).toBe(12);
    await a.sync();
    expect(await reps(a, 'w1')).toBe(12);
    expect(await b.db.outboxCount()).toBe(0);
  });

  test('the newer change wins even when it syncs second', async () => {
    vi.setSystemTime(1_800_000_400_000);
    await a.db.put('logs', [log('w1', 20)]);
    vi.setSystemTime(1_800_000_500_000);
    await b.db.put('logs', [log('w1', 21)]);
    await a.sync();
    await b.sync();
    await a.sync();
    expect(await reps(a, 'w1')).toBe(21);
    expect(await reps(b, 'w1')).toBe(21);
  });

  test('restoring a backup on one phone deletes what it dropped everywhere', async () => {
    vi.setSystemTime(1_800_000_600_000);
    await a.db.put('logs', [log('w3', 4)]);
    await a.sync();
    await b.sync();
    expect(await reps(b, 'w3')).toBe(4);
    vi.setSystemTime(1_800_000_700_000);
    await b.db.replace('logs', [log('w9', 9)]);
    await b.sync();
    await a.sync();
    const ids = ((await a.db.all('logs')) as { id: string }[]).map((l) => l.id).sort();
    expect(ids).toEqual(['w9']);
  });

  test("a phone's own changes coming back don't count as new", async () => {
    vi.setSystemTime(1_800_000_800_000);
    await a.db.set('profile', { usesPounds: false, gyms: [] });
    await a.sync();
    expect((await a.sync()).pulled).toBe(0);
    await b.sync();
    expect(await b.db.get('profile')).toEqual({ usesPounds: false, gyms: [] });
  });
});

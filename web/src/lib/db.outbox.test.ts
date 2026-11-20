// The sync outbox: which local changes get queued, and how changes from the server are applied.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { db, onLocalChange, sameData } from './db';

type R = { id: string; [k: string]: unknown };
const keys = async () => (await db.outbox()).map((e) => `${e.key}${e.deleted ? ' (deleted)' : ''}@${e.at}`).sort();

beforeEach(async () => {
  await db.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1000);
});

describe('queueing local changes', () => {
  test('saving and deleting records queues them; device-only values do not', async () => {
    const heard = vi.fn();
    const stop = onLocalChange(heard);
    await db.put('logs', [{ id: 'w1' }, { id: 'w2' }]);
    await db.set('profile', { a: 1 });
    await db.update('profile', (p) => ({ ...(p as object), b: 2 }));
    await db.set('kv', { todayPlan: 1 });
    await db.set('session', { running: true });
    vi.setSystemTime(2000);
    await db.delete('logs', 'w2');
    stop();
    expect(await keys()).toEqual(['logs:w1@1000', 'logs:w2 (deleted)@2000', 'profile:profile@1000']);
    expect(heard).toHaveBeenCalledTimes(4);
  });

  test('replacing a collection queues what it drops as deletions', async () => {
    await db.put('templates', [{ id: 't1' }, { id: 't2' }]);
    await db.replace('templates', [{ id: 't2' }, { id: 't3' }]);
    expect(await keys()).toEqual(['templates:t1 (deleted)@1000', 'templates:t2@1000', 'templates:t3@1000']);
  });

  test('signing in queues everything not already queued, at time 0', async () => {
    await db.applyRemote([{ store: 'logs', id: 'old', at: 5, deleted: false, body: { id: 'old' } }]);
    await db.set('profile', { a: 1 });
    await db.queueEverything();
    expect(await keys()).toEqual(['logs:old@0', 'profile:profile@1000']);
  });
});

describe('applying changes from the server', () => {
  test('a newer local change waiting to go up wins', async () => {
    vi.setSystemTime(5000);
    await db.put('logs', [{ id: 'w1', mine: true } as R]);
    expect(await db.applyRemote([{ store: 'logs', id: 'w1', at: 4000, deleted: false, body: { id: 'w1', mine: false } }])).toBe(0);
    expect(await db.readSynced('logs', 'w1')).toEqual({ id: 'w1', mine: true });
    expect(await keys()).toEqual(['logs:w1@5000']);
  });

  test('a newer server change replaces the local one and its queue entry', async () => {
    await db.put('logs', [{ id: 'w1', mine: true } as R]);
    expect(await db.applyRemote([{ store: 'logs', id: 'w1', at: 9000, deleted: false, body: { id: 'w1', mine: false } }])).toBe(1);
    expect(await db.readSynced('logs', 'w1')).toEqual({ id: 'w1', mine: false });
    expect(await keys()).toEqual([]);
  });

  test('deletions and the profile apply; identical data counts as no change', async () => {
    await db.applyRemote([{ store: 'logs', id: 'w1', at: 1, deleted: false, body: { id: 'w1', a: 1, b: 2 } }]);
    expect(await db.applyRemote([{ store: 'logs', id: 'w1', at: 2, deleted: false, body: { b: 2, a: 1, id: 'w1' } }])).toBe(0);
    expect(await db.applyRemote([
      { store: 'logs', id: 'w1', at: 3, deleted: true, body: null },
      { store: 'profile', id: 'profile', at: 3, deleted: false, body: { usesPounds: true } },
    ])).toBe(2);
    expect(await db.readSynced('logs', 'w1')).toBeUndefined();
    expect(await db.get('profile')).toEqual({ usesPounds: true });
    expect(await keys()).toEqual([]);
  });

  test('settling keeps an entry that changed again during the push', async () => {
    await db.put('logs', [{ id: 'w1' }]);
    const [pushed] = await db.outbox();
    vi.setSystemTime(3000);
    await db.put('logs', [{ id: 'w1', edited: true } as R]);
    await db.settle(pushed);
    expect(await keys()).toEqual(['logs:w1@3000']);
    await db.settle((await db.outbox())[0]);
    expect(await keys()).toEqual([]);
  });
});

test('sameData ignores key order and undefined keys', () => {
  expect(sameData({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
  expect(sameData({ a: 1, x: undefined }, { a: 1 })).toBe(true);
  expect(sameData({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  expect(sameData({ a: 1 }, { a: '1' })).toBe(false);
});

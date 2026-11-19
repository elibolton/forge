import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Bug hunt batch 2, logger items (L8, L9, L10, L12, L13). Persistence is a no-op here.
vi.mock('./db', () => ({
  db: { get: vi.fn(async () => undefined), set: async () => {}, del: async () => {}, allLogs: async () => [], putLogs: vi.fn(async () => {}), deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: async () => false,
}));

const { Gyms, defaultPlan } = await import('../engine');
const { app } = await import('./store.svelte');
const { session, newSet, STALE_AFTER } = await import('./session.svelte');
const { checkSet } = await import('./setCheck');
type SessionExercise = import('./session.svelte').SessionExercise;

function exercise(id: string, sets: ReturnType<typeof newSet>[], o: Partial<SessionExercise> = {}): SessionExercise {
  return { id, exerciseID: 'bb-bench', sets, restSeconds: 120, targetRIR: 2, targetReps: 8, rir: null, reasons: [], ...o };
}

function start(exercises: SessionExercise[], startedAt = Date.now() - 3_600_000) {
  session.startPrepared({ startedAt, focus: 'push', exercises, currentIndex: 0 });
}

beforeEach(() => {
  app.createProfile(defaultPlan(), Gyms.commercial(), false);
  app.restoreLogs([]);
  session.discard();
  session.finished = null;
});
afterEach(() => vi.useRealTimers());

describe('Rep typos (L8)', () => {
  test('80 typed for 8 is flagged; normal high-rep sets are not', () => {
    expect(checkSet(100, 80, 100, { targetReps: 8, mostReps: 10 })).toEqual({ kind: 'manyReps', usual: 10 });
    expect(checkSet(100, 12, 100, { targetReps: 8, mostReps: 10 })).toBeNull();
    expect(checkSet(20, 25, 30, { targetReps: 15, mostReps: 20 })).toBeNull();
    expect(checkSet(null, 30, undefined, {})).toBeNull();
    expect(checkSet(null, 31, undefined, {})).toEqual({ kind: 'manyReps' });
    // A lifter who really does 50-rep sets isn't nagged.
    expect(checkSet(null, 50, undefined, { mostReps: 40 })).toBeNull();
  });

  test('timed work (reps are seconds) is never flagged for reps', () => {
    expect(checkSet(40, 90, 40, { targetReps: 30, isTimed: true })).toBeNull();
  });
});

describe('Failure sets made straight (L9)', () => {
  test('reverting a failure set clears the 0 it was given, so it can be rated', () => {
    const sets = [newSet(80, 8), newSet(80, 8)];
    start([exercise('a', sets)]);
    session.setType('a', sets[0].id, 'failure');
    session.logSet(sets[0].id, 'a');
    expect(session.state!.exercises[0].sets[0].rir).toBe(0);
    session.setType('a', sets[0].id, null);
    const s = session.state!.exercises[0].sets[0];
    expect(s.type).toBeUndefined();
    expect(s.rir).toBeNull();
  });

  test('a real rating is kept when the type changes', () => {
    const sets = [newSet(80, 8)];
    start([exercise('a', sets)]);
    session.logSet(sets[0].id, 'a');
    session.rateSet('a', sets[0].id, 2);
    session.setType('a', sets[0].id, 'drop');
    session.setType('a', sets[0].id, null);
    expect(session.state!.exercises[0].sets[0].rir).toBe(2);
  });
});

describe('Per-side with a drop set (L10)', () => {
  test('rating the right side rates the left straight set, not the drop after it', () => {
    const l = newSet(20, 10, { side: 'left' }), r = newSet(20, 10, { side: 'right' });
    start([exercise('a', [l, r])]);
    session.addDropSet('a', l.id, 15);
    const sets = session.state!.exercises[0].sets;
    expect(sets.map((s) => s.type ?? 'straight')).toEqual(['straight', 'drop', 'straight']);
    session.rateSet('a', r.id, 2);
    const after = session.state!.exercises[0].sets;
    expect(after[0].rir).toBe(2);
    expect(after[1].rir ?? null).toBeNull();
  });
});

describe('Log as planned (L12)', () => {
  test('skips placeholder sets: 0 reps, unlogged drops and loaded sets with no weight', () => {
    const good = newSet(80, 8), zero = newSet(80, 0), noWeight = newSet(null, 8);
    start([exercise('a', [newSet(40, 8, { isWarmup: true }), good, zero, noWeight])]);
    session.addDropSet('a', good.id, 60);
    session.logRemainingAsPlanned();
    const sets = session.state!.exercises[0].sets;
    expect(sets.filter((s) => s.done).map((s) => s.id)).toEqual([good.id]);
  });

  test('bodyweight sets with no weight are still logged', () => {
    const s = newSet(null, 10);
    start([exercise('a', [s], { exerciseID: 'pull-up' })]);
    session.logRemainingAsPlanned();
    expect(session.state!.exercises[0].sets[0].done).toBe(true);
  });
});

describe('A workout left open overnight (L13)', () => {
  test('finishing hours after the last change ends it at the last change', async () => {
    const t0 = Date.now();
    vi.useFakeTimers({ now: t0 });
    const s = newSet(80, 8);
    start([exercise('a', [s])], t0 - 30 * 60_000);
    session.logSet(s.id, 'a');
    session.skipRest();
    vi.setSystemTime(t0 + 10 * 3_600_000);
    expect(session.endedAt()).toBe(t0);
    await session.finish();
    const log = app.logs[0];
    expect(log.durationSeconds).toBe(30 * 60);
  });

  test('moving between exercises is not activity', () => {
    const t0 = Date.now();
    vi.useFakeTimers({ now: t0 });
    start([exercise('a', [newSet(80, 8)]), exercise('b', [newSet(80, 8)])]);
    const before = session.lastActiveAt;
    vi.setSystemTime(t0 + 60_000);
    session.goTo(1);
    expect(session.state!.currentIndex).toBe(1);
    expect(session.lastActiveAt).toBe(before);
  });

  test('closing the "Still training?" sheet does not count as activity, and does not ask again for that spell', () => {
    const t0 = Date.now();
    vi.useFakeTimers({ now: t0 });
    start([exercise('a', [newSet(80, 8)])]);
    vi.setSystemTime(t0 + STALE_AFTER + 60_000);
    session.checkStale();
    expect(session.staleSince).not.toBeNull();
    session.dismissStale();
    expect(session.staleSince).toBeNull();
    session.checkStale();
    expect(session.staleSince).toBeNull();
    expect(session.endedAt()).toBe(session.lastActiveAt);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Persistence is IndexedDB in the app; here it's a no-op.
vi.mock('./db', () => ({
  db: { get: vi.fn(async () => undefined), set: async () => {}, del: async () => {}, allLogs: async () => [], putLogs: vi.fn(async () => {}), deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: async () => false,
}));

const { Gyms, Programs, defaultPlan, newProgress } = await import('../engine');
const { app } = await import('./store.svelte');
const { session, newSet } = await import('./session.svelte');
const { goalStreak, trainedDays, weeklyCounts, DAY } = await import('./weeks');
const { exerciseRecords, prTimeline } = await import('./records');
const { toExternal } = await import('./activities');
const { db } = await import('./db');
const { saving } = await import('./saving.svelte');
const { checkSet } = await import('./setCheck');
type SessionExercise = import('./session.svelte').SessionExercise;
type ProgramSlotInfo = import('./session.svelte').ProgramSlotInfo;

function exercise(id: string, sets: ReturnType<typeof newSet>[], o: Partial<SessionExercise> = {}): SessionExercise {
  return { id, exerciseID: 'bb-bench', sets, restSeconds: 120, targetRIR: 2, targetReps: 8, rir: null, reasons: [], ...o };
}

const info = (o: Partial<ProgramSlotInfo>): ProgramSlotInfo => ({
  slotID: 'x.1', range: { lower: 8, upper: 12 }, effort: { type: 'rir', rir: { low: 1, high: 2 } }, setsText: '', effortText: '',
  restText: '', notes: [], laterality: 'bilateral', isOptional: false, ...o,
});

function start(exercises: SessionExercise[], program?: { programID: string; week: number; dayID: string; isDeload: boolean }) {
  session.startPrepared({ startedAt: Date.now() - 3_600_000, focus: 'push', exercises, currentIndex: 0, program });
}

beforeEach(() => {
  app.createProfile(defaultPlan(), Gyms.commercial(), false);
  app.restoreLogs([]);
  session.discard();
  session.finished = null;
});
afterEach(() => vi.useRealTimers());

describe('Logging sets', () => {
  test('a working set carries its weight to the sets still to do, and starts rest', () => {
    const sets = [newSet(40, 8, { isWarmup: true }), newSet(80, 8), newSet(80, 8), newSet(80, 8)];
    start([exercise('a', sets)]);
    session.updateExercise('a', (e) => { e.sets[1].weight = 85; });
    session.logSet(sets[1].id, 'a');
    const after = session.state!.exercises[0].sets;
    expect(after[1].done).toBe(true);
    expect(after.slice(2).map((s) => s.weight)).toEqual([85, 85]);
    expect(after[0].weight).toBe(40); // warm-ups untouched
    expect(session.restTotal).toBe(120);
    expect(session.restEndsAt).not.toBeNull();
  });

  test('warm-ups and re-logging a done set do not start rest', () => {
    const sets = [newSet(40, 8, { isWarmup: true }), newSet(80, 8)];
    start([exercise('a', sets)]);
    session.logSet(sets[0].id, 'a');
    expect(session.restEndsAt).toBeNull();
    session.logSet(sets[1].id, 'a');
    session.skipRest();
    session.logSet(sets[1].id, 'a');
    expect(session.restEndsAt).toBeNull();
  });

  test('per-side work: short rest between sides, full rest after the round', () => {
    const sets = [newSet(20, 10, { side: 'left' }), newSet(20, 10, { side: 'right' })];
    start([exercise('a', sets, { restSeconds: 120, program: info({ laterality: 'perLeg', sideRest: 60 }) })]);
    session.logSet(sets[0].id, 'a');
    expect(session.restTotal).toBe(60);
    session.logSet(sets[1].id, 'a');
    expect(session.restTotal).toBe(120);
  });

  test('per-side work with no side rest goes straight to the other side', () => {
    const sets = [newSet(10, 12, { side: 'left' }), newSet(10, 12, { side: 'right' })];
    start([exercise('a', sets, { program: info({ laterality: 'perArm' }) })]);
    session.logSet(sets[0].id, 'a');
    expect(session.restEndsAt).toBeNull();
  });

  test('supersets alternate: short rest, then jump to the partner', () => {
    const a = [newSet(30, 10), newSet(30, 10)], b = [newSet(25, 10), newSet(25, 10)];
    start([
      exercise('a', a, { program: info({ supersetGroup: '6', supersetRestBetween: 90 }), restSeconds: 90 }),
      exercise('b', b, { exerciseID: 'skull-crusher', program: info({ supersetGroup: '6' }), restSeconds: 120 }),
    ]);
    session.logSet(a[0].id, 'a');
    expect(session.restTotal).toBe(90);
    expect(session.state!.currentIndex).toBe(1);
    session.logSet(b[0].id, 'b');
    expect(session.restTotal).toBe(120);
    expect(session.state!.currentIndex).toBe(0);
  });

  test('log remaining as planned marks every working set done', () => {
    start([exercise('a', [newSet(40, 8, { isWarmup: true }), newSet(80, 8), newSet(80, 8)])]);
    session.logRemainingAsPlanned();
    const sets = session.state!.exercises[0].sets;
    expect(sets.filter((s) => !s.isWarmup).every((s) => s.done)).toBe(true);
    expect(sets[0].done).toBe(false);
  });
});

describe('Finishing', async () => {
  test('saves only done sets, with RIR on working sets', async () => {
    start([
      exercise('a', [newSet(40, 8, { isWarmup: true, done: true }), newSet(80, 8, { done: true }), newSet(80, 8)], { rir: 1 }),
      exercise('b', [newSet(20, 12)], { exerciseID: 'db-fly' }),
    ]);
    await session.finish();
    expect(app.logs.length).toBe(1);
    const [bench] = app.logs[0].exercises;
    expect(app.logs[0].exercises.map((e) => e.exerciseID)).toEqual(['bb-bench']);
    expect(bench.sets.map((s) => [s.isWarmup, s.rir])).toEqual([[true, null], [false, 1]]);
    expect(app.logs[0].durationSeconds).toBeGreaterThan(3500);
    expect(session.state).toBeNull();
    expect(session.finished?.records).toEqual([]);
  });

  test('lowering-only work is saved without RIR', async () => {
    start([exercise('a', [newSet(0, 5, { done: true })], { exerciseID: 'nordic-curl', rir: 2, program: info({ effort: { type: 'eccentricOnly' } }) })]);
    await session.finish();
    expect(app.logs[0].exercises[0].sets[0].rir).toBeNull();
    expect(app.logs[0].exercises[0].slotID).toBe('x.1');
  });

  test('beating your best estimated 1RM is a personal record', async () => {
    start([exercise('a', [newSet(80, 5, { done: true })], { rir: 2 })]);
    await session.finish();
    start([exercise('a', [newSet(90, 5, { done: true })], { rir: 2 })]);
    const records = (await session.finish())!;
    expect(records.map((r) => r.exercise.id)).toEqual(['bb-bench']);
    expect(records[0].oneRM).toBeGreaterThan(records[0].previous);
  });

  test('nothing logged saves nothing', async () => {
    start([exercise('a', [newSet(80, 8)])]);
    await session.finish();
    expect(app.logs.length).toBe(0);
  });

  test('a program day moves the program on once it has working sets', async () => {
    const program = Programs.pplul8;
    app.setProgramProgress(newProgress(program.id));
    start([exercise('a', [newSet(80, 8, { done: true })])], { programID: program.id, week: 1, dayID: 'push', isDeload: false });
    await session.finish();
    expect(app.profile!.programProgress!.completed[1]).toEqual(['push']);
  });

  test('a failed save keeps the workout open, adds nothing and can be tried again', async () => {
    const program = Programs.pplul8;
    app.setProgramProgress(newProgress(program.id));
    start([exercise('a', [newSet(80, 8, { done: true })])], { programID: program.id, week: 1, dayID: 'push', isDeload: false });
    vi.mocked(db.putLogs).mockRejectedValueOnce(Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    expect(await session.finish()).toBeNull();
    expect(session.state).not.toBeNull();
    expect(session.state!.exercises[0].sets[0].done).toBe(true);
    expect(app.logs.length).toBe(0);
    expect(app.profile!.programProgress!.completed[1] ?? []).toEqual([]);
    expect(saving.lastFailure).toMatch(/out of storage/);
    expect(saving.error).toBeNull(); // the dropped log isn't retried behind your back

    expect(await session.finish()).toEqual([]);
    expect(app.logs.length).toBe(1);
    expect(session.state).toBeNull();
    expect(saving.error).toBeNull();
  });

  test('a second tap while saving logs the workout once', async () => {
    start([exercise('a', [newSet(80, 8, { done: true })])]);
    const [first, second] = await Promise.all([session.finish(), session.finish()]);
    expect(first).toEqual([]);
    expect(second).toBeNull();
    expect(app.logs.length).toBe(1);
  });
});

describe('Forgotten workouts', () => {
  test('a workout untouched for hours is flagged; a recent change is not', () => {
    start([exercise('a', [newSet(80, 8)])]);
    // update() stamps the change itself, so set the old time on the state directly.
    session.state = { ...session.state!, updatedAt: Date.now() - 4 * 3_600_000 };
    session.checkStale();
    expect(session.staleSince).not.toBeNull();
    session.keepGoing();
    expect(session.staleSince).toBeNull();
    session.checkStale();
    expect(session.staleSince).toBeNull();
  });

  test('saving a forgotten workout ends it at the last change', async () => {
    start([exercise('a', [newSet(80, 8, { done: true })])]);
    const startedAt = session.state!.startedAt;
    await session.finish(startedAt + 50 * 60_000);
    expect(app.logs[0].durationSeconds).toBe(50 * 60);
  });
});

describe('Loading', () => {
  test('an unreadable workout in progress blocks the app instead of being overwritten', async () => {
    vi.mocked(db.get).mockRejectedValueOnce(new Error('Connection to Indexed Database server lost'));
    await session.load();
    expect(app.loadError).toMatch(/Indexed Database/);
    app.loadError = null;
  });
});

describe('Checking a set before logging', () => {
  test('no reps is never logged', () => {
    expect(checkSet(80, 0, 100)).toEqual({ kind: 'noReps' });
  });
  test('far over your heaviest asks first; a normal jump does not', () => {
    expect(checkSet(105, 5, 100)).toBeNull();
    expect(checkSet(119, 5, 100)).toBeNull();
    expect(checkSet(1000, 5, 100)).toEqual({ kind: 'heavy', heaviest: 100 });
    expect(checkSet(35, 5, 10)).toEqual({ kind: 'heavy', heaviest: 10 }); // light lifts: needs +20 kg too
    expect(checkSet(25, 5, 10)).toBeNull();
  });
  test('with no history only absurd weights ask', () => {
    expect(checkSet(200, 5, undefined)).toBeNull();
    expect(checkSet(450, 5, undefined)).toEqual({ kind: 'heavy' });
    expect(checkSet(null, 12, undefined)).toBeNull();
  });
});

describe('Weeks and goals', () => {
  // Wednesday 18 Nov 2026, local time.
  const now = new Date(2026, 10, 18, 18).getTime();
  const day = (offset: number) => now + offset * DAY;

  test('trained days are marked Monday first', () => {
    expect(trainedDays([day(-2), day(0)], now)).toEqual([true, false, true, false, false, false, false]);
  });

  test('the streak counts weeks that hit the goal, and survives an unfinished week', () => {
    const lastWeek = [day(-7), day(-8), day(-9)];
    const twoAgo = [day(-14), day(-15), day(-16)];
    expect(goalStreak([...lastWeek, ...twoAgo], 3, now)).toBe(2);
    expect(goalStreak([...lastWeek, ...twoAgo, day(0), day(-1), day(-2)], 3, now)).toBe(3);
    expect(goalStreak([...lastWeek, day(-14)], 3, now)).toBe(1);
    expect(goalStreak([], 3, now)).toBe(0);
  });

  test('weekly counts are oldest first and end with this week', () => {
    expect(weeklyCounts([day(0), day(-1), day(-7)], 3, now)).toEqual([0, 1, 2]);
  });
});

describe('Records', () => {
  const log = (id: string, date: number, weight: number, reps: number) =>
    ({ id, date, exercises: [{ exerciseID: 'bb-squat', sets: [{ weight, reps, rir: 0, isWarmup: false }] }] });

  test('personal bests per exercise', () => {
    const r = exerciseRecords([
      { date: 1, logged: { exerciseID: 'bb-squat', sets: [{ weight: 100, reps: 5, isWarmup: false }, { weight: 110, reps: 1, isWarmup: false }] } },
      { date: 2, logged: { exerciseID: 'bb-squat', sets: [{ weight: 60, reps: 15, isWarmup: false }] } },
    ]);
    expect(r.heaviest?.value).toBe(110);
    expect(r.mostReps?.value).toBe(15);
    expect(r.volume?.value).toBe(900);
    // 100 × 5 (≈117) beats 110 × 1 (110) and 60 × 15 (90).
    expect(r.oneRM?.date).toBe(1);
    expect(r.oneRM?.value).toBeCloseTo(116.67, 1);
  });

  test('the first session is not a record; later bests are, newest first', () => {
    const events = prTimeline([log('a', 1, 100, 5), log('b', 2, 100, 5), log('c', 3, 105, 5), log('d', 4, 110, 5)]);
    expect(events.map((e) => e.logID)).toEqual(['d', 'c']);
    expect(events[0].previous).toBeCloseTo(events[1].oneRM);
  });
});

describe('Activities', () => {
  test('runs tire the legs; walks count at half; other cardio does not count', () => {
    const ext = toExternal([
      { id: '1', kind: 'run', date: 0, minutes: 40 },
      { id: '2', kind: 'walk', date: 0, minutes: 60 },
      { id: '3', kind: 'other', date: 0, minutes: 30 },
    ]);
    expect(ext.length).toBe(2);
    expect(ext[0].muscles).toContain('quads');
    expect(ext[1].minutes).toBe(30);
  });
});

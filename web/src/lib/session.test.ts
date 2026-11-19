import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Persistence is IndexedDB in the app; here it's a no-op.
vi.mock('./db', () => ({
  db: { get: vi.fn(async () => undefined), set: async () => {}, del: async () => {}, allLogs: async () => [], putLogs: vi.fn(async () => {}), deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: async () => false,
}));

const { Gyms, Programs, defaultPlan, newProgress } = await import('../engine');
const { app } = await import('./store.svelte');
const { session, newSet, supersetOf, numberedSets } = await import('./session.svelte');
const { setLabels } = await import('./labels');
const { groupLabel } = await import('./groups');
const { templateFromSession, readTemplate } = await import('./templates');
const { sessionFromTemplate } = await import('./templateStart');
const { goalStreak, trainedDays, weeklyCounts, DAY } = await import('./weeks');
const { exerciseRecords, prTimeline } = await import('./records');
const { toExternal } = await import('./activities');
const { db } = await import('./db');
const { saving } = await import('./saving.svelte');
const { checkSet } = await import('./setCheck');
const { workoutLog, newRecords, completesProgramDay } = await import('./finishWorkout');
const { liveRecords } = await import('./records');
const { oneRM } = await import('../engine');
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

describe('Changing a workout in progress', () => {
  const ids = () => session.state!.exercises.map((x) => x.id);

  test('removing an exercise can be undone, back where it was and still showing', () => {
    start([exercise('a', [newSet(80, 8)]), exercise('b', [newSet(20, 12)]), exercise('c', [newSet(30, 10)])]);
    session.goTo(2);
    const undo = session.removeExercise('c')!;
    expect(ids()).toEqual(['a', 'b']);
    expect(session.state!.currentIndex).toBe(1);
    undo();
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(session.state!.currentIndex).toBe(2);
    expect(session.removeExercise('nope')).toBeUndefined();
  });

  test('moving keeps the showing exercise showing; moves past the ends do nothing', () => {
    start([exercise('a', [newSet(80, 8)]), exercise('b', [newSet(20, 12)])]);
    session.moveExercise('a', 1);
    expect(ids()).toEqual(['b', 'a']);
    expect(session.state!.currentIndex).toBe(1);
    session.moveExercise('a', 1);
    expect(ids()).toEqual(['b', 'a']);
    session.goTo(5);
    expect(session.state!.currentIndex).toBe(1);
  });

  test('set edits are never negative and reps are whole', () => {
    const set = newSet(80, 8);
    start([exercise('a', [set])]);
    session.editSet('a', set.id, { weight: -5, reps: 7.6 });
    expect(session.state!.exercises[0].sets[0]).toMatchObject({ weight: 0, reps: 8 });
    session.editSet('a', set.id, { reps: -2 });
    expect(session.state!.exercises[0].sets[0].reps).toBe(0);
    session.editSet('a', set.id, { weight: null });
    expect(session.state!.exercises[0].sets[0].weight).toBeNull();
  });

  test('adding a set copies the last working set; per-side work adds both sides', () => {
    start([
      exercise('a', [newSet(40, 8, { isWarmup: true }), newSet(80, 6)]),
      exercise('b', [newSet(20, 10, { side: 'left' }), newSet(20, 10, { side: 'right' })], { program: info({ laterality: 'perArm' }) }),
      exercise('c', []),
    ]);
    session.addSet('a');
    session.addSet('b');
    session.addSet('c');
    const [a, b, c] = session.state!.exercises;
    expect(a.sets.slice(-1)[0]).toMatchObject({ weight: 80, reps: 6, isWarmup: false, done: false });
    expect(b.sets.slice(-2).map((x) => x.side)).toEqual(['left', 'right']);
    expect(c.sets).toMatchObject([{ weight: null, reps: 10 }]);
  });

  test('marking done, removing a set and rating RIR', () => {
    const [s1, s2] = [newSet(80, 8), newSet(80, 8)];
    start([exercise('a', [s1, s2])]);
    session.setDone('a', s1.id, true);
    session.removeSet('a', s2.id);
    session.setRIR('a', 2.4);
    const a = session.state!.exercises[0];
    expect(a.sets.map((x) => x.done)).toEqual([true]);
    expect(a.rir).toBe(2);
    expect(session.restEndsAt).toBeNull(); // only logSet starts rest
  });

  test('discarding hands back the workout for undo', () => {
    start([exercise('a', [newSet(80, 8, { done: true })])]);
    const snapshot = session.discard()!;
    expect(session.state).toBeNull();
    session.restore(snapshot);
    expect(session.state!.exercises[0].sets[0].done).toBe(true);
    expect(session.discard()).not.toBeNull();
    expect(session.discard()).toBeNull();
  });
});

describe('Building the saved workout', () => {
  const state = (exercises: SessionExercise[], program?: { programID: string; week: number; dayID: string; isDeload: boolean }) =>
    ({ startedAt: 1_000_000, focus: 'push' as const, exercises, currentIndex: 0, program });

  test('nothing done is nothing to save', () => {
    expect(workoutLog(state([exercise('a', [newSet(80, 8)])]), 'x', 2_000_000)).toBeNull();
  });

  test('it ends when told, never before it started', () => {
    const st = state([exercise('a', [newSet(80, 8, { done: true })])]);
    expect(workoutLog(st, 'x', 1_000_000 + 45 * 60_000)!.durationSeconds).toBe(45 * 60);
    expect(workoutLog(st, 'x', 0)!.durationSeconds).toBe(0);
  });

  test('a program day completes only with a working set', () => {
    const ref = { programID: 'p', week: 1, dayID: 'push', isDeload: false };
    expect(completesProgramDay(workoutLog(state([exercise('a', [newSet(80, 8, { done: true })])], ref), 'x', 2_000_000))).toBe(true);
    expect(completesProgramDay(workoutLog(state([exercise('a', [newSet(40, 8, { isWarmup: true, done: true })])], ref), 'x', 2_000_000))).toBe(false);
    expect(completesProgramDay(workoutLog(state([exercise('a', [newSet(80, 8, { done: true })])]), 'x', 2_000_000))).toBe(false);
  });

  test('records beat the previous best by more than half a percent; first times are not records', () => {
    const log = workoutLog(state([exercise('a', [newSet(100, 5, { done: true })], { rir: 0 })]), 'x', 2_000_000)!;
    expect(newRecords(log.exercises, new Map())).toEqual([]);
    expect(newRecords(log.exercises, new Map([['bb-bench', 200]]))).toEqual([]);
    expect(newRecords(log.exercises, new Map([['bb-bench', 100]])).map((r) => r.exercise.id)).toEqual(['bb-bench']);
  });
});

describe('Supersets, tri-sets and circuits', () => {
  const sets = (n: number, w = 20) => Array.from({ length: n }, () => newSet(w, 10));
  const groupsNow = () => session.state!.exercises.map((x) => supersetOf(x) ?? '-').join('');
  const ex = (id: string, n = 3, o: Partial<SessionExercise> = {}) => exercise(id, sets(n), { exerciseID: 'db-fly', restSeconds: 90, ...o });
  const logNext = () => {
    const cur = session.state!.exercises[session.state!.currentIndex];
    session.logSet(cur.sets.find((x) => !x.done && !x.isWarmup)!.id, cur.id);
    return cur.id;
  };

  test('a tri-set rotates through all three, with a short rest between and the full rest after each round', () => {
    start([ex('a'), ex('b', 3, { restSeconds: 120 }), ex('c')]);
    session.linkWithNext('a');
    session.linkWithNext('b');
    expect(groupsNow()).toBe('AAA');
    const order: string[] = [], rests: number[] = [];
    for (let k = 0; k < 9; k++) { order.push(logNext()); rests.push(session.restTotal); }
    expect(order.join('')).toBe('abcabcabc');
    expect(rests).toEqual([30, 30, 120, 30, 30, 120, 30, 30, 120]);
  });

  test('an exercise that runs out of sets drops out of the rotation', () => {
    start([ex('a', 2), ex('b', 1), ex('c', 2), ex('d', 2)]);
    session.linkWithNext('a'); session.linkWithNext('b'); session.linkWithNext('c');
    const order: string[] = [];
    for (let k = 0; k < 7; k++) order.push(logNext());
    expect(order.join('')).toBe('abcdacd');
  });

  test('a program pair keeps its own between-rest', () => {
    start([
      ex('a', 2, { program: info({ supersetGroup: '6', supersetRestBetween: 75 }), restSeconds: 75 }),
      ex('b', 2, { program: info({ supersetGroup: '6' }), restSeconds: 120 }),
    ]);
    logNext();
    expect(session.restTotal).toBe(75);
    logNext();
    expect(session.restTotal).toBe(120);
  });

  test('linking joins groups; unlinking splits them, and one left alone leaves the group', () => {
    start([ex('a'), ex('b'), ex('c'), ex('d'), ex('e')]);
    session.linkWithNext('a');
    session.linkWithNext('c');
    expect(groupsNow()).toBe('AABB-');
    session.linkWithNext('b'); // joins the two pairs into a circuit of four
    expect(groupsNow()).toBe('AAAA-');
    session.unlinkFromNext('b');
    expect(groupsNow()).toBe('AABB-');
    session.unlinkFromNext('a');
    expect(groupsNow()).toBe('--BB-');
  });

  test('moving or removing an exercise keeps every group a run of neighbours', () => {
    start([ex('a'), ex('b'), ex('c'), ex('d')]);
    session.linkWithNext('a'); session.linkWithNext('b');
    expect(groupsNow()).toBe('AAA-');
    session.moveExercise('c', 1);
    expect(groupsNow()).toBe('AA--');
    session.removeExercise('b');
    expect(groupsNow()).toBe('---');
  });

  test('ungrouping gives a short-rest exercise its own rest back', () => {
    start([ex('a', 3, { supersetGroup: 'A', restSeconds: 30 }), ex('b', 3, { supersetGroup: 'A', restSeconds: 120 })]);
    session.unlinkFromNext('a');
    expect(session.state!.exercises.map((x) => x.restSeconds)).toEqual([60, 120]);
  });

  test('saved workouts keep their groups', () => {
    start([ex('a'), ex('b'), ex('c')]);
    session.linkWithNext('a'); session.linkWithNext('b');
    const t = templateFromSession('Arms', session.state!.exercises);
    expect(t.exercises.map((x) => x.group)).toEqual(['A', 'A', 'A']);
    expect(readTemplate(JSON.parse(JSON.stringify(t)))!.exercises.map((x) => x.group)).toEqual(['A', 'A', 'A']);
    const started = sessionFromTemplate(t, app.planner());
    expect(started.exercises.map((x) => x.supersetGroup)).toEqual(['A', 'A', 'A']);
    const lonely = sessionFromTemplate({ ...t, exercises: [t.exercises[0], { ...t.exercises[1], group: undefined }] }, app.planner());
    expect(lonely.exercises.map((x) => x.supersetGroup)).toEqual([undefined, undefined]);
  });

  test('names by size', () => {
    expect([2, 3, 4, 6].map(groupLabel)).toEqual(['Superset', 'Tri-set', 'Circuit', 'Circuit']);
  });
});

describe('Drop and failure sets', () => {
  const sets = () => session.state!.exercises[0].sets;

  test('a drop set comes straight after its set: no rest, no carried weight, and the rating waits', () => {
    const [s1, s2] = [newSet(100, 8), newSet(100, 8)];
    start([exercise('a', [s1, s2])]);
    session.addDropSet('a', s1.id, 80);
    session.addDropSet('a', s1.id, 60);
    expect(sets().map((x) => [x.weight, x.type ?? 'straight'])).toEqual([[100, 'straight'], [80, 'drop'], [60, 'drop'], [100, 'straight']]);
    session.editSet('a', s1.id, { weight: 105 });
    session.logSet(s1.id, 'a');
    expect(session.restEndsAt).toBeNull();
    expect(session.pendingRating).toBeNull();
    expect(sets().map((x) => x.weight)).toEqual([105, 80, 60, 105]); // drops keep their weight, the next set gets 105
    session.logSet(sets()[1].id, 'a');
    expect(session.restEndsAt).toBeNull(); // another drop still to go
    session.logSet(sets()[2].id, 'a');
    expect(session.restTotal).toBe(120);
    expect(session.pendingRating?.setID).toBe(s1.id); // rate the set the drops came from
  });

  test('a failure set is logged with 0 reps left and no prompt', () => {
    const s1 = newSet(100, 8);
    start([exercise('a', [s1])]);
    session.setType('a', s1.id, 'failure');
    session.logSet(s1.id, 'a');
    expect(sets()[0].rir).toBe(0);
    expect(session.pendingRating).toBeNull();
    session.setType('a', s1.id, null);
    expect(sets()[0].type).toBeUndefined();
  });

  test('drop sets are not numbered and new sets copy the last straight set', () => {
    const s1 = newSet(100, 8);
    start([exercise('a', [newSet(40, 8, { isWarmup: true }), s1])]);
    session.addDropSet('a', s1.id, 70);
    session.addSet('a');
    expect(numberedSets(sets()).map((x) => x.weight)).toEqual([100, 100]);
    expect(sets().slice(-1)[0].type).toBeUndefined();
  });

  test('in a superset, the drop comes before moving on', () => {
    const [a1, b1] = [newSet(30, 10), newSet(25, 10)];
    start([exercise('a', [a1, newSet(30, 10)], { supersetGroup: 'A' }), exercise('b', [b1, newSet(25, 10)], { exerciseID: 'skull-crusher', supersetGroup: 'A' })]);
    session.addDropSet('a', a1.id, 20);
    session.logSet(a1.id, 'a');
    expect(session.state!.currentIndex).toBe(0);
    session.logSet(session.state!.exercises[0].sets[1].id, 'a');
    expect(session.state!.currentIndex).toBe(1);
  });

  test('set types are saved with the workout', async () => {
    start([exercise('a', [newSet(100, 8, { done: true, type: 'failure', rir: 0 }), newSet(70, 6, { done: true, type: 'drop' }), newSet(40, 8, { isWarmup: true, done: true, type: 'drop' })])]);
    await session.finish();
    expect(app.logs[0].exercises[0].sets.map((x) => x.type ?? null)).toEqual(['failure', 'drop', null]);
  });

  test('history labels: W, numbers, and D for drops', () => {
    expect(setLabels([{ isWarmup: true }, { isWarmup: false }, { isWarmup: false, type: 'drop' }, { isWarmup: false, type: 'failure' }])).toEqual(['W', '1', 'D', '2']);
  });
});

describe('Rating sets', () => {
  test('logging a working set asks for its rating; warm-ups, first sides and lowering-only work do not', () => {
    const [w, a1] = [newSet(40, 8, { isWarmup: true }), newSet(80, 8)];
    start([
      exercise('a', [w, a1]),
      exercise('b', [newSet(20, 10, { side: 'left' }), newSet(20, 10, { side: 'right' })], { program: info({ laterality: 'perArm' }) }),
      exercise('c', [newSet(0, 5)], { exerciseID: 'nordic-curl', program: info({ effort: { type: 'eccentricOnly' } }) }),
    ]);
    session.logSet(w.id, 'a');
    expect(session.pendingRating).toBeNull();
    session.logSet(a1.id, 'a');
    expect(session.pendingRating).toEqual({ exerciseID: 'a', setID: a1.id });

    const [left, right] = session.state!.exercises[1].sets;
    session.logSet(left.id, 'b');
    expect(session.pendingRating).toBeNull();
    session.logSet(right.id, 'b');
    expect(session.pendingRating?.setID).toBe(right.id);

    session.logSet(session.state!.exercises[2].sets[0].id, 'c');
    expect(session.pendingRating).toBeNull();
  });

  test('rating the right side rates an unrated left side too, and closes the prompt', () => {
    start([exercise('b', [newSet(20, 10, { side: 'left', done: true }), newSet(20, 10, { side: 'right', done: true })], { program: info({ laterality: 'perLeg' }) })]);
    const [left, right] = session.state!.exercises[0].sets;
    session.pendingRating = { exerciseID: 'b', setID: right.id };
    session.rateSet('b', right.id, 2);
    expect(session.state!.exercises[0].sets.map((x) => x.rir)).toEqual([2, 2]);
    expect(session.pendingRating).toBeNull();
    session.rateSet('b', left.id, 1);
    session.rateSet('b', right.id, 3);
    expect(session.state!.exercises[0].sets.map((x) => x.rir)).toEqual([1, 3]); // a left side rated on its own keeps its rating
  });

  test('each set is saved with its own rating, falling back to the exercise rating', async () => {
    start([exercise('a', [newSet(80, 8, { done: true, rir: 3 }), newSet(80, 8, { done: true }), newSet(80, 8, { done: true, rir: 0 })], { rir: 1 })]);
    await session.finish();
    expect(app.logs[0].exercises[0].sets.map((x) => x.rir)).toEqual([3, 1, 0]);
  });
});

describe('Live personal records', () => {
  const set = (weight: number, reps: number, o: Partial<ReturnType<typeof newSet>> = {}) => newSet(weight, reps, { done: true, ...o });

  test('a set beating your best by over 0.5% is a record; only sets that beat earlier ones today count', () => {
    const sets = [set(100, 5), set(105, 5), set(102.5, 5), set(110, 5)];
    const best = oneRM(100, 5, 0);
    expect([...liveRecords(sets, best).keys()]).toEqual([sets[1].id, sets[3].id]);
  });

  test('no history, warm-ups, unlogged sets and bodyweight sets are never records', () => {
    expect(liveRecords([set(200, 5)], undefined).size).toBe(0);
    expect(liveRecords([set(200, 5, { isWarmup: true }), newSet(200, 5), set(0, 20)], 50).size).toBe(0);
  });

  test('a rating counts toward the estimate', () => {
    const best = oneRM(100, 5, 0);
    expect(liveRecords([set(100, 5)], best).size).toBe(0);
    expect(liveRecords([set(100, 5, { rir: 2 })], best).size).toBe(1);
    expect(liveRecords([set(100, 5)], best, 2).size).toBe(1);
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

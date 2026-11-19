import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Bug hunt batch 3, logger and display items (L14–L22, U7, U8, S13). Persistence is a no-op here.
vi.mock('./db', () => ({
  db: { get: vi.fn(async () => undefined), set: async () => {}, del: async () => {}, allLogs: async () => [], putLogs: vi.fn(async () => {}), deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: async () => false,
}));

const { Catalog, Gyms, defaultPlan } = await import('../engine');
const { app } = await import('./store.svelte');
const { session, newSet, setProgress, CHIME_LATE_MS } = await import('./session.svelte');
const { groupOf, groupLabel, members } = await import('./groups');
const { WeightUnits, fmtNum, fromLocalInput, toLocalInput } = await import('./units');
type SessionExercise = import('./session.svelte').SessionExercise;
type ProgramSlotInfo = import('./session.svelte').ProgramSlotInfo;

function exercise(id: string, sets: ReturnType<typeof newSet>[], o: Partial<SessionExercise> = {}): SessionExercise {
  return { id, exerciseID: 'bb-bench', sets, restSeconds: 120, targetRIR: 2, targetReps: 8, rir: null, reasons: [], ...o };
}

const info = (o: Partial<ProgramSlotInfo>): ProgramSlotInfo => ({
  slotID: 'x.1', range: { lower: 8, upper: 12 }, effort: { type: 'rir', rir: { low: 1, high: 2 } }, setsText: '', effortText: '',
  restText: '', notes: [], laterality: 'bilateral', isOptional: false, ...o,
});

const sets3 = () => [newSet(80, 8), newSet(80, 8), newSet(80, 8)];

function start(exercises: SessionExercise[]) {
  session.startPrepared({ startedAt: Date.now() - 3_600_000, focus: 'push', exercises, currentIndex: 0 });
}
const ids = () => session.state!.exercises.map((x) => x.id);
const current = () => session.state!.exercises[session.state!.currentIndex].id;

beforeEach(() => {
  app.createProfile(defaultPlan(), Gyms.commercial(), false);
  app.restoreLogs([]);
  session.discard();
  session.finished = null;
});
afterEach(() => vi.useRealTimers());

describe('Removing an exercise above the one showing (L14)', () => {
  test('stays on the same exercise', () => {
    start([exercise('a', sets3()), exercise('b', sets3()), exercise('c', sets3())]);
    session.goTo(1);
    session.removeExercise('a');
    expect(current()).toBe('b');
  });

  test('removing one below, or the one showing, behaves as before', () => {
    start([exercise('a', sets3()), exercise('b', sets3()), exercise('c', sets3())]);
    session.goTo(1);
    session.removeExercise('c');
    expect(current()).toBe('b');
    session.removeExercise('b');
    expect(current()).toBe('a');
  });
});

describe('Moving past a superset (L15)', () => {
  test('an exercise below a superset hops over the whole group, which stays intact', () => {
    start([exercise('a', sets3(), { supersetGroup: 'A' }), exercise('b', sets3(), { supersetGroup: 'A' }), exercise('c', sets3())]);
    session.moveExercise('c', -1);
    expect(ids()).toEqual(['c', 'a', 'b']);
    const [c, a, b] = session.state!.exercises;
    expect(groupOf(a)).toBe('A');
    expect(groupOf(b)).toBe('A');
    expect(groupOf(c)).toBeUndefined();
    session.moveExercise('c', 1);
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(groupOf(session.state!.exercises[0])).toBe('A');
  });

  test('the exercise showing stays showing', () => {
    start([exercise('a', sets3(), { supersetGroup: 'A' }), exercise('b', sets3(), { supersetGroup: 'A' }), exercise('c', sets3())]);
    session.goTo(1);
    session.moveExercise('c', -1);
    expect(current()).toBe('b');
  });

  test('moving within a group still reorders it', () => {
    start([exercise('a', sets3(), { supersetGroup: 'A' }), exercise('b', sets3(), { supersetGroup: 'A' })]);
    session.moveExercise('b', -1);
    expect(ids()).toEqual(['b', 'a']);
    expect(session.state!.exercises.every((x) => groupOf(x) === 'A')).toBe(true);
  });
});

describe('Swapping half of a superset after logging (L16)', () => {
  test('the pair stays a pair: the finished original leaves the group', () => {
    const a = sets3(), b = sets3();
    start([exercise('a', a, { supersetGroup: 'A' }), exercise('b', b, { supersetGroup: 'A' })]);
    session.logSet(a[0].id, 'a');
    session.logSet(b[0].id, 'b');
    expect(session.swapExercise('a', Catalog.exercise('db-bench'), app.planner())).toBe(true);
    const s = session.state!;
    expect(members(s, 'A').length).toBe(2);
    expect(groupLabel(members(s, 'A').length)).toBe('Superset');
    const old = s.exercises.find((x) => x.id === 'a')!;
    expect(groupOf(old)).toBeUndefined();
    expect(old.sets.every((x) => x.done)).toBe(true);
    expect(s.exercises[s.currentIndex].exerciseID).toBe('db-bench');
  });

  test('swapping the second of a pair keeps the group next to each other', () => {
    const a = sets3(), b = sets3();
    start([exercise('a', a, { supersetGroup: 'A' }), exercise('b', b, { supersetGroup: 'A' })]);
    session.logSet(a[0].id, 'a');
    session.logSet(b[0].id, 'b');
    session.swapExercise('b', Catalog.exercise('db-bench'), app.planner());
    const s = session.state!;
    expect(s.exercises.map((x) => groupOf(x) ?? '-')).toEqual(['-', 'A', 'A']);
    expect(s.exercises[0].id).toBe('b');
    expect(s.exercises[s.currentIndex].exerciseID).toBe('db-bench');
  });
});

describe('Swapping after only warm-ups (L17)', () => {
  test('replaces the exercise outright, with its own warm-ups', () => {
    const sets = [newSet(40, 8, { isWarmup: true, done: true }), ...sets3()];
    start([exercise('a', sets)]);
    session.swapExercise('a', Catalog.exercise('bb-ohp'), app.planner());
    const s = session.state!;
    expect(s.exercises.length).toBe(1);
    expect(s.exercises[0].exerciseID).toBe('bb-ohp');
    expect(s.exercises[0].sets.some((x) => !x.isWarmup)).toBe(true);
  });

  test('a program exercise is replaced outright too, with nothing marked done', () => {
    const sets = [newSet(40, 8, { isWarmup: true, done: true }), ...sets3()];
    start([exercise('a', sets, { program: info({}) })]);
    session.swapExercise('a', Catalog.exercise('bb-ohp'), app.planner());
    const s = session.state!;
    expect(s.exercises.length).toBe(1);
    expect(s.exercises[0].exerciseID).toBe('bb-ohp');
    expect(s.exercises[0].sets.filter((x) => !x.isWarmup).length).toBe(3);
    expect(s.exercises[0].sets.every((x) => !x.done)).toBe(true);
  });
});

describe('Deleting a set with drop sets (L18)', () => {
  test('its drop sets go with it', () => {
    const sets = sets3();
    start([exercise('a', sets)]);
    session.addDropSet('a', sets[0].id, 60);
    session.addDropSet('a', sets[0].id, 50);
    expect(session.state!.exercises[0].sets.length).toBe(5);
    session.removeSet('a', sets[0].id);
    const after = session.state!.exercises[0].sets;
    expect(after.map((x) => x.id)).toEqual([sets[1].id, sets[2].id]);
    expect(after.some((x) => x.type === 'drop')).toBe(false);
  });

  test('deleting a drop set leaves the others', () => {
    const sets = sets3();
    start([exercise('a', sets)]);
    session.addDropSet('a', sets[0].id, 60);
    const drop = session.state!.exercises[0].sets[1];
    session.removeSet('a', drop.id);
    expect(session.state!.exercises[0].sets.map((x) => x.id)).toEqual(sets.map((x) => x.id));
  });
});

describe('A set with no rest after it (L19)', () => {
  test('stops the countdown left over from the set before', () => {
    const sets = sets3();
    start([exercise('a', sets, { restSeconds: 0 })]);
    session.startRest(90);
    session.logSet(sets[0].id, 'a');
    expect(session.restEndsAt).toBeNull();
  });

  test('the left side with no side rest stops it too', () => {
    const sets = [newSet(20, 10, { side: 'left' }), newSet(20, 10, { side: 'right' })];
    start([exercise('a', sets, { program: info({ laterality: 'perArm' }) })]);
    session.startRest(90);
    session.logSet(sets[0].id, 'a');
    expect(session.restEndsAt).toBeNull();
  });

  test('a set with rest still starts it', () => {
    const sets = sets3();
    start([exercise('a', sets)]);
    session.logSet(sets[0].id, 'a');
    expect(session.restEndsAt).not.toBeNull();
  });
});

describe('Set count for per-side work (L20)', () => {
  test('a left and a right count as one set', () => {
    const sets = [0, 1, 2].flatMap(() => [newSet(20, 10, { side: 'left' }), newSet(20, 10, { side: 'right' })]);
    const e = exercise('a', sets, { program: info({ laterality: 'perArm' }) });
    expect(setProgress(e)).toEqual({ next: 1, total: 3 });
    sets[0].done = true;
    expect(setProgress(e)).toEqual({ next: 1, total: 3 });
    sets[1].done = true;
    expect(setProgress(e)).toEqual({ next: 2, total: 3 });
    for (const s of sets) s.done = true;
    expect(setProgress(e)).toEqual({ next: 3, total: 3 });
  });

  test('two-sided work counts each set; no working sets gives 0', () => {
    const sets = sets3();
    sets[0].done = true;
    expect(setProgress(exercise('a', sets))).toEqual({ next: 2, total: 3 });
    expect(setProgress(exercise('b', [newSet(40, 8, { isWarmup: true })])).total).toBe(0);
  });
});

describe('Double-tapping Save (L21)', () => {
  test('the second tap is "busy", not a failure', async () => {
    start([exercise('a', [newSet(80, 8, { done: true })])]);
    const [first, second] = await Promise.all([session.finish(), session.finish()]);
    expect(first).toEqual([]);
    expect(second).toBeUndefined();
  });
});

describe('Late rest chime (L22)', () => {
  test('no chime when the rest ended more than a few seconds ago', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    start([exercise('a', sets3())]);
    session.startRest(60);
    // The timer fires late, as when iOS froze it in the background.
    vi.setSystemTime(Date.now() + 60_000 + CHIME_LATE_MS + 5000);
    vi.advanceTimersByTime(60_000);
    expect(vibrate).not.toHaveBeenCalled();
  });

  test('an on-time rest still chimes', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    start([exercise('a', sets3())]);
    session.startRest(60);
    vi.advanceTimersByTime(60_000);
    expect(vibrate).toHaveBeenCalled();
  });
});

describe('Weights shown as saved (U8, S13)', () => {
  const kg = new WeightUnits(false), lb = new WeightUnits(true);

  test('1.25 kg steps, 0.1 kg weigh-ins and small values aren\'t rounded to 0.5', () => {
    expect(kg.display(61.25)).toBe(61.25);
    expect(kg.format(61.25)).toBe('61.25 kg');
    expect(kg.display(80.3)).toBe(80.3);
    expect(kg.format(0.2)).toBe('0.2 kg');
    expect(kg.format(82.3)).toBe('82.3 kg');
    expect(kg.format(100)).toBe('100 kg');
  });

  test('a load typed in lb shows back as typed', () => {
    for (const typed of [135, 137.5, 2.5, 47.5]) expect(lb.display(lb.kg(typed))).toBe(typed);
    expect(lb.format(lb.kg(137.5))).toBe('137.5 lb');
  });

  test('totals in the thousands show whole', () => {
    expect(fmtNum(kg.display(1837.5), 0)).toBe((1838).toLocaleString());
    expect(kg.format(1837.5)).toBe(`${(1838).toLocaleString()} kg`);
  });
});

describe('Editing a workout without changing its date (U7)', () => {
  test('the same minute keeps the saved time, seconds and all', () => {
    const saved = new Date(2026, 3, 5, 18, 42, 37, 512).getTime();
    expect(fromLocalInput(toLocalInput(saved), saved)).toBe(saved);
  });

  test('a changed time is used, and an emptied input keeps the saved one', () => {
    const saved = new Date(2026, 3, 5, 18, 42, 37).getTime();
    expect(fromLocalInput('2026-04-05T19:00', saved)).toBe(new Date(2026, 3, 5, 19, 0).getTime());
    expect(fromLocalInput('', saved)).toBe(saved);
  });
});

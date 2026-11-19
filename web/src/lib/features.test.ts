import { describe, expect, test, vi } from 'vitest';

vi.mock('./db', () => ({
  db: { get: async () => undefined, set: async () => {}, del: async () => {}, allLogs: async () => [], putLogs: async () => {}, deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: async () => false,
}));

const { Gyms, Planner, defaultPlan } = await import('../engine');
const { templateFromLogged, readTemplate } = await import('./templates');
const { sessionFromTemplate } = await import('./templateStart');
const { pickMobility, addMobility } = await import('./mobility');
const { periodReport, statsBetween } = await import('./report');
const { session } = await import('./session.svelte');
type SessionState = import('./session.svelte').SessionState;
const { app } = await import('./store.svelte');

const planner = new Planner({ plan: defaultPlan(), gym: Gyms.commercial(), history: [] });

describe('Saved workouts', () => {
  test('a saved workout keeps working sets and typical reps, not warm-ups', () => {
    const t = templateFromLogged('Push A', [
      { exerciseID: 'bb-bench', sets: [{ weight: 40, reps: 10, isWarmup: true }, { weight: 80, reps: 8, isWarmup: false }, { weight: 80, reps: 7, isWarmup: false }, { weight: 80, reps: 6, isWarmup: false }] },
      { exerciseID: 'db-fly', sets: [{ weight: 0, reps: 0, isWarmup: true }] },
    ]);
    expect(t.name).toBe('Push A');
    expect(t.exercises).toEqual([{ exerciseID: 'bb-bench', sets: 3, reps: 7 }]);
  });

  test('starting one uses its sets and reps with weights from the planner, plus warm-ups for heavy lifts', () => {
    const s = sessionFromTemplate({ id: 't', name: 'Push A', createdAt: 0, exercises: [{ exerciseID: 'bb-bench', sets: 4, reps: 6 }] }, planner);
    const working = s.exercises[0].sets.filter((x) => !x.isWarmup);
    expect(working.length).toBe(4);
    expect(working.every((x) => x.reps === 6 && (x.weight ?? 0) > 0)).toBe(true);
    expect(s.exercises[0].sets.some((x) => x.isWarmup)).toBe(true);
    expect(s.title).toBe('Push A');
  });

  test('stored templates load tolerantly', () => {
    expect(readTemplate({ id: 'a', name: '', exercises: [{ exerciseID: 'bb-bench', sets: 3.4, reps: 8 }, { nope: 1 }] }))
      .toMatchObject({ name: 'My workout', exercises: [{ exerciseID: 'bb-bench', sets: 3, reps: 8 }] });
    expect(readTemplate({ id: 'a', exercises: [] })).toBeUndefined();
  });
});

describe('Warm-up and cool-down', () => {
  test('picks drills and stretches for the muscles being trained', () => {
    expect(pickMobility(['chest', 'triceps'], 'cooldown').map((e) => e.id)).toContain('tricep-stretch');
    expect(pickMobility(['hamstrings', 'glutes'], 'warmup').map((e) => e.id)).toContain('hip-hinge-drill');
    expect(pickMobility([], 'warmup').length).toBe(3);
  });

  test('adds them before and after only when switched on', () => {
    const state: SessionState = { startedAt: 0, focus: null, currentIndex: 0, exercises: [{ id: 'x', exerciseID: 'bb-bench', sets: [], restSeconds: 90, targetRIR: 2, targetReps: 8, rir: null, reasons: [] }] };
    addMobility(state, ['chest'], { warmup: true, cooldown: false });
    expect(state.exercises.length).toBe(4);
    expect(state.exercises[3].exerciseID).toBe('bb-bench');
    addMobility(state, ['chest'], { warmup: false, cooldown: true });
    expect(state.exercises.length).toBe(7);
    expect(state.exercises[6].sets[0].reps).toBe(30);
  });
});

describe('Report', () => {
  const log = (date: number, minutes: number, reps: number) =>
    ({ date, durationSeconds: minutes * 60, exercises: [{ exerciseID: 'bb-bench', sets: [{ weight: 100, reps, isWarmup: false }, { weight: 40, reps: 10, isWarmup: true }] }] });

  test('totals working sets, volume and time in a range', () => {
    expect(statsBetween([log(5, 45, 5), log(50, 30, 8)], 0, 10)).toEqual({ workouts: 1, minutes: 45, sets: 1, volume: 500 });
  });

  test('compares this week so far with all of last week', () => {
    const now = new Date(2026, 10, 19, 12).getTime(); // Thursday
    const day = 86_400_000;
    const r = periodReport([log(now - day, 40, 5), log(now - 7 * day, 50, 5), log(now - 8 * day, 50, 5)], 'week', now);
    expect(r.current.workouts).toBe(1);
    expect(r.previous.workouts).toBe(2);
  });
});

describe('Rest timer', () => {
  test('+15 s after rest has run out counts from now', () => {
    app.createProfile(defaultPlan(), Gyms.commercial(), false);
    session.startPrepared({ startedAt: Date.now(), focus: null, exercises: [], currentIndex: 0 });
    session.startRest(60);
    session.restEndsAt = Date.now() - 120_000;
    session.extendRest(15);
    expect(session.restEndsAt! - Date.now()).toBeGreaterThan(14_000);
    session.discard();
  });
});

describe('Supersets', async () => {
  const { pairSupersets, SUPERSET_REST_BETWEEN, Catalog, plannedWorkingSets } = await import('../engine');
  const { newSet: makeSet } = await import('./session.svelte');
  const p = (id: string) => planner.prescribe(Catalog.byID.get(id)!);

  test('pairs non-competing exercises back to back, preferring opposites; the main lift stays alone', () => {
    const out = pairSupersets([p('bb-bench'), p('db-curl'), p('db-row'), p('tricep-pushdown'), p('db-lateral-raise')]);
    expect(out[0].supersetGroup).toBeUndefined();
    const groups = out.filter((x) => x.supersetGroup).map((x) => `${x.supersetGroup}:${x.exercise.id}`);
    expect(groups).toContain('A:db-curl');
    expect(groups).toContain('A:tricep-pushdown'); // biceps with triceps beats biceps with a row (shared biceps)
    for (let i = 0; i < out.length; i++) {
      const g = out[i].supersetGroup;
      if (!g) continue;
      const partner = out.findIndex((x, j) => j !== i && x.supersetGroup === g);
      expect(Math.abs(partner - i)).toBe(1);
    }
    const first = out.find((x) => x.supersetGroup === 'A')!;
    expect(first.restSeconds).toBe(SUPERSET_REST_BETWEEN);
  });

  test('never pairs exercises that work the same muscles', () => {
    const out = pairSupersets([p('bb-squat'), p('leg-extension'), p('goblet-squat')]);
    expect(out.every((x) => !x.supersetGroup)).toBe(true);
  });

  test('a generated workout with supersets on still fits the session and has pairs', () => {
    for (const focus of ['push', 'pull', 'upper', 'fullBody'] as const) {
      const w = new Planner({ plan: defaultPlan({ supersets: true, sessionMinutes: 45 }), gym: Gyms.commercial(), history: [] }).generate({ now: Date.now(), seed: 3, focus });
      expect(w.estimatedMinutes, focus).toBeLessThanOrEqual(46);
      if (focus === 'upper' || focus === 'fullBody') expect(w.exercises.some((x) => x.supersetGroup), focus).toBe(true);
      expect(w.exercises.every((x) => plannedWorkingSets(x).length >= 2)).toBe(true);
    }
  });

  test('the logger alternates generated supersets', () => {
    app.createProfile(defaultPlan(), Gyms.commercial(), false);
    const a = [makeSet(12, 12), makeSet(12, 12)], b = [makeSet(30, 12), makeSet(30, 12)];
    session.startPrepared({ startedAt: Date.now(), focus: null, currentIndex: 0, exercises: [
      { id: 'a', exerciseID: 'db-curl', sets: a, restSeconds: 30, targetRIR: 2, targetReps: 12, rir: null, reasons: [], supersetGroup: 'A' },
      { id: 'b', exerciseID: 'tricep-pushdown', sets: b, restSeconds: 75, targetRIR: 2, targetReps: 12, rir: null, reasons: [], supersetGroup: 'A' },
    ] });
    session.logSet(a[0].id, 'a');
    expect(session.state!.currentIndex).toBe(1);
    expect(session.restTotal).toBe(30);
    session.logSet(b[0].id, 'b');
    expect(session.state!.currentIndex).toBe(0);
    expect(session.restTotal).toBe(75);
    session.discard();
  });
});

describe('Bodyweight', async () => {
  const { bodyweightTrend, readBodyweight } = await import('./bodyweight');
  const DAY = 86_400_000;
  const now = Date.now();

  test('trend compares with the weigh-in nearest a month ago', () => {
    const t = bodyweightTrend([
      { id: '1', date: now, kg: 80 }, { id: '2', date: now - 3 * DAY, kg: 81 },
      { id: '3', date: now - 29 * DAY, kg: 82.5 }, { id: '4', date: now - 60 * DAY, kg: 85 },
    ], now)!;
    expect(t.latest.kg).toBe(80);
    expect(t.change).toBeCloseTo(-2.5);
  });

  test('no change shown until there is a week-old weigh-in', () => {
    expect(bodyweightTrend([{ id: '1', date: now, kg: 80 }, { id: '2', date: now - 2 * DAY, kg: 79 }], now)?.change).toBeUndefined();
    expect(bodyweightTrend([], now)).toBeUndefined();
  });

  test('stored weigh-ins load tolerantly', () => {
    expect(readBodyweight({ id: 'a', date: 1, kg: 80 })).toEqual({ id: 'a', date: 1, kg: 80 });
    expect(readBodyweight({ id: 'a', date: 1, kg: 4 })).toBeUndefined();
  });
});

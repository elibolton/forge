import { describe, expect, test, vi } from 'vitest';

// The session module persists to IndexedDB; tests only need its pure helpers.
vi.mock('./db', () => ({ db: { get: async () => undefined, set: async () => {}, del: async () => {} }, requestPersistence: async () => false }));

const { Catalog, Gyms, Planner, defaultPlan } = await import('../engine');
const { platesPerSide, barFor } = await import('./plates');
const { swapInSession } = await import('./swap');
const { newSet } = await import('./session.svelte');
type SessionState = import('./session.svelte').SessionState;

const ex = (id: string) => Catalog.byID.get(id)!;
const planner = new Planner({ plan: defaultPlan(), gym: Gyms.commercial(), history: [] });

describe('Plates', () => {
  test('loads a pound bar heaviest first', () => {
    expect(platesPerSide(225, 45, true)).toEqual({ plates: [45, 45], remainder: 0 });
    expect(platesPerSide(185, 45, true)).toEqual({ plates: [45, 25], remainder: 0 });
    expect(platesPerSide(137.5, 45, true)).toEqual({ plates: [45], remainder: 1.25 });
  });
  test('loads a kilo bar and reports what plates cannot make', () => {
    expect(platesPerSide(100, 20, false)).toEqual({ plates: [25, 15], remainder: 0 });
    expect(platesPerSide(61, 20, false).remainder).toBe(0.5);
    expect(platesPerSide(15, 20, false).plates).toEqual([]);
  });
  test('only barbell-style lifts get plates', () => {
    expect(barFor(ex('bb-bench'), true)).toBe(45);
    expect(barFor(ex('ez-curl'), false)).toBe(10);
    expect(barFor(ex('db-bench'), true)).toBeUndefined();
  });
});

function state(exerciseID: string, done: number, total: number, program = false): SessionState {
  return {
    startedAt: 0, focus: null, currentIndex: 0,
    exercises: [{
      id: 'a', exerciseID, restSeconds: 90, targetRIR: 2, targetReps: 8, rir: null, reasons: [],
      sets: Array.from({ length: total }, (_, k) => newSet(60, 8, { done: k < done })),
      program: program ? {
        slotID: 'push.1', range: { lower: 6, upper: 10 }, effort: { type: 'rir', rir: { low: 1, high: 2 } }, setsText: '', effortText: '',
        restText: '', notes: [], laterality: 'bilateral', isOptional: false,
      } : undefined,
    }],
  };
}

describe('Swap mid-workout', () => {
  test('nothing logged: the replacement takes its place', () => {
    const s = state('bb-bench', 0, 3);
    swapInSession(s, 'a', ex('db-bench'), planner);
    expect(s.exercises.map((x) => x.exerciseID)).toEqual(['db-bench']);
  });
  test('logged sets stay; the rest move to the replacement after it', () => {
    const s = state('bb-bench', 1, 3);
    swapInSession(s, 'a', ex('db-bench'), planner);
    expect(s.exercises.map((x) => x.exerciseID)).toEqual(['bb-bench', 'db-bench']);
    expect(s.exercises[0].sets.length).toBe(1);
    expect(s.exercises[1].sets.filter((x) => !x.isWarmup).length).toBe(2);
    expect(s.currentIndex).toBe(1);
  });
  test('program details carry over and set count is kept', () => {
    const s = state('bb-bench', 0, 3, true);
    swapInSession(s, 'a', ex('db-bench'), planner);
    const next = s.exercises[0];
    expect(next.program?.slotID).toBe('push.1');
    expect(next.sets.filter((x) => !x.isWarmup).length).toBe(3);
    expect(next.sets.every((x) => !x.done)).toBe(true);
  });
  test('all sets done: nothing to swap', () => {
    const s = state('bb-bench', 3, 3);
    swapInSession(s, 'a', ex('db-bench'), planner);
    expect(s.exercises.map((x) => x.exerciseID)).toEqual(['bb-bench']);
  });
});

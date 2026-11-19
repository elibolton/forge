import { beforeEach, describe, expect, test, vi } from 'vitest';

// Bug hunt batch 2: L11, P12, S12/U9, F4. Persistence is a no-op here.
vi.mock('./db', () => ({
  db: { get: vi.fn(async () => undefined), set: async () => {}, del: async () => {}, allLogs: async () => [], putLogs: vi.fn(async () => {}), deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: async () => false,
}));

const { Gyms, Programs, defaultPlan, makeGym, newProgress } = await import('../engine');
const { app } = await import('./store.svelte');
const { session, newSet, rangeChanges } = await import('./session.svelte');
const { hasOneRM, newRecords } = await import('./finishWorkout');
const { gymLoadKinds, nextStep } = await import('./loadSteps');
const { canPull } = await import('./gymFit');
type SessionExercise = import('./session.svelte').SessionExercise;

beforeEach(() => {
  app.createProfile(defaultPlan(), Gyms.commercial(), false);
  app.restoreLogs([]);
  session.discard();
});

describe('Timed holds get no e1RM records (L11)', () => {
  test('a longer carry is not a 1RM record', () => {
    expect(hasOneRM('farmer-carry')).toBe(false);
    expect(hasOneRM('bb-bench')).toBe(true);
    const carry = { exerciseID: 'farmer-carry', sets: [{ weight: 40, reps: 60, isWarmup: false }] };
    expect(newRecords([carry], new Map([['farmer-carry', 45]]))).toEqual([]);
  });

  test('history keeps no best e1RM for timed holds, so live records never fire', () => {
    app.restoreLogs([{ id: 'a', date: Date.now() - 86_400_000, focus: null, durationSeconds: 0, program: null,
      exercises: [{ exerciseID: 'farmer-carry', sets: [{ weight: 40, reps: 30, isWarmup: false }] },
        { exerciseID: 'bb-bench', sets: [{ weight: 80, reps: 5, isWarmup: false }] }] }]);
    expect(app.derivedHistory.bestOneRM.has('farmer-carry')).toBe(false);
    expect(app.derivedHistory.bestOneRM.has('bb-bench')).toBe(true);
  });
});

describe('Range extensions are saved when the day is logged, not when it starts (P12)', () => {
  const ex = (id: string, slotID: string, rangeExtension: number | null | undefined, done: boolean): SessionExercise => ({
    id, exerciseID: 'leaning-db-lateral-raise', sets: [{ ...newSet(8, 20), done }], restSeconds: 60, targetRIR: 1, targetReps: 12, rir: null, reasons: [],
    program: { slotID, range: { lower: 12, upper: 24 }, effort: { type: 'rir', rir: { low: 0, high: 1 } }, setsText: '', effortText: '', restText: '',
      notes: [], laterality: 'bilateral', isOptional: false, ...(rangeExtension !== undefined ? { rangeExtension } : {}) },
  });

  test('only slots with work logged count', () => {
    const state = { startedAt: 0, focus: null, currentIndex: 0, exercises: [
      ex('a', 'upper.5', 4, true), ex('b', 'push.4', null, true), ex('c', 'pull.4', 4, false), ex('d', 'legs.4', undefined, true)] };
    expect(rangeChanges(state)).toEqual({ 'upper.5': 4, 'push.4': null });
  });

  test('a discarded start changes nothing; finishing saves the change', async () => {
    const program = Programs.pplul8;
    const progress = newProgress(program.id);
    progress.rangeExtensions['push.4'] = 4;
    app.setProgramProgress(progress);
    const ref = { programID: program.id, week: 1, dayID: 'upper', isDeload: false };
    session.startPrepared({ startedAt: Date.now() - 3_600_000, focus: 'upper', exercises: [ex('a', 'upper.5', 4, false)], currentIndex: 0, program: ref }, true);
    session.discard();
    expect(app.profile!.programProgress!.rangeExtensions).toEqual({ 'push.4': 4 });

    session.startPrepared({ startedAt: Date.now() - 3_600_000, focus: 'upper', exercises: [ex('a', 'upper.5', 4, true), ex('b', 'push.4', null, true)], currentIndex: 0, program: ref }, true);
    await session.finish();
    expect(app.profile!.programProgress!.rangeExtensions).toEqual({ 'upper.5': 4 });
  });
});

describe('Weight steps for every load the gym has (S12, U9)', () => {
  test('EZ bar, trap bar, Smith machine and machines each get their own step', () => {
    const kinds = gymLoadKinds(Gyms.commercial());
    for (const k of ['barbell', 'ezBar', 'trapBar', 'smithMachine', 'legPress', 'legCurl', 'legExtension', 'chestPressMachine', 'shoulderPressMachine'] as const) {
      expect(kinds).toContain(k);
    }
  });

  test('an EZ-bar-only gym shows an EZ bar step, not a barbell one', () => {
    const kinds = gymLoadKinds(makeGym('EZ', ['ezBar', 'flatBench']));
    expect(kinds).toContain('ezBar');
    expect(kinds).not.toContain('barbell');
  });

  test('kg steps reach the 1.25 kg microplate', () => {
    expect(nextStep(2.5, -1, false)).toBe(2);
    expect(nextStep(1.5, -1, false)).toBe(1.25);
    expect(nextStep(10, 1, false)).toBeUndefined();
    expect(nextStep(0.5, -1, false)).toBeUndefined();
    expect(nextStep(5, 1, true)).toBe(10);
  });
});

describe('Onboarding warns when nothing can train the back (F4)', () => {
  test('bodyweight only cannot pull; home and gym presets can', () => {
    expect(canPull(Gyms.bodyweight())).toBe(false);
    expect(canPull(Gyms.home())).toBe(true);
    expect(canPull(Gyms.homeBarbell())).toBe(true);
  });
});

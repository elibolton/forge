import { beforeEach, describe, expect, test, vi } from 'vitest';

// Follow-ups to the new-user polish pass. Persistence is a no-op here.
vi.mock('./db', () => ({
  db: { get: vi.fn(async () => undefined), set: async () => {}, del: async () => {}, allLogs: async () => [], putLogs: async () => {}, deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: async () => false,
}));

const { Gyms, Programs, defaultPlan, dayOrder, effortText, newProgress, repsLeftText, rirTarget } = await import('../engine');
const { app } = await import('./store.svelte');
const { weeklyGoalFor } = await import('./weeks');

const program = Programs.all[0];

describe('Weekly goal follows a running program', () => {
  beforeEach(() => app.createProfile(defaultPlan(), Gyms.commercial(), false, 3));

  test('uses the program’s training days, not the profile goal', () => {
    expect(weeklyGoalFor(3, program)).toBe(dayOrder(program).length);
    expect(weeklyGoalFor(3, null)).toBe(3);
  });

  test('the app’s goal switches with the program and back', () => {
    expect(app.weeklyGoal).toBe(3);
    app.setProgramProgress(newProgress(program.id));
    expect(app.weeklyGoal).toBe(dayOrder(program).length);
    app.setProgramProgress({ ...newProgress(program.id), isFinished: true });
    expect(app.weeklyGoal).toBe(3);
    app.setProgramProgress(null);
    expect(app.weeklyGoal).toBe(3);
  });
});

describe('Effort targets in plain words', () => {
  test('"N reps left", with "to failure" for 0', () => {
    expect(repsLeftText(rirTarget(3))).toBe('3 reps left');
    expect(repsLeftText(rirTarget(1))).toBe('1 rep left');
    expect(repsLeftText(rirTarget(1, 2))).toBe('1–2 reps left');
    expect(repsLeftText(rirTarget(0))).toBe('to failure');
    expect(effortText({ type: 'rir', rir: rirTarget(2) })).toBe('2 reps left');
  });

  test('no program text says "RIR"', () => {
    for (const p of Programs.all) {
      const words = [p.summary, ...p.progressionNotes, ...p.weekRules.flatMap((r) => [...r.notes, r.isolationLastSetNote ?? '']),
        ...p.days.flatMap((d) => d.exercises.flatMap((x) => [...x.notes, x.lastSetNote ?? '']))];
      for (const w of words) expect(w).not.toMatch(/\bRIR\b/);
    }
  });
});

describe('Gym presets are named after their titles', () => {
  test('Full Gym, Home Gym (Barbell + Cables), Home Gym, No Equipment', () => {
    expect([Gyms.commercial(), Gyms.homeBarbell(), Gyms.home(), Gyms.bodyweight()].map((g) => g.name))
      .toEqual(['Full Gym', 'Home Gym (Barbell + Cables)', 'Home Gym', 'No Equipment']);
  });
});

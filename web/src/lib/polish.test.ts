import { describe, expect, test, vi } from 'vitest';

// New-user polish pass: short workouts, first-week report comparisons.
vi.mock('./db', () => ({
  db: { get: vi.fn(async () => undefined), set: async () => {}, del: async () => {}, update: async () => {}, put: async () => {}, delete: async () => {}, replace: async () => {}, all: async () => [], allLogs: async () => [], putLogs: async () => {}, deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: async () => false,
}));
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

const { durationText, WeightUnits } = await import('./units');
const { change } = await import('./report');
const { logSummary } = await import('./logs');

describe('workout duration (F7)', () => {
  test('under a minute reads "<1 min", never "0 min"', () => {
    expect(durationText(0)).toBe('<1 min');
    expect(durationText(42)).toBe('<1 min');
    expect(durationText(59.9)).toBe('<1 min');
  });

  test('whole minutes from a minute up, rounded the same way the weekly report rounds (I-data)', () => {
    expect(durationText(60)).toBe('1 min');
    expect(durationText(89)).toBe('1 min');
    expect(durationText(170)).toBe('3 min');
    expect(durationText(47 * 60 + 30)).toBe('48 min');
  });

  test('a logged 30-second workout says so in its summary', () => {
    const log = { id: 'a', date: 0, focus: null, durationSeconds: 30, exercises: [], program: null };
    expect(logSummary(log, new WeightUnits(false))).toBe('0 exercises · <1 min');
  });

  test('an imported workout (no duration) leaves time out', () => {
    const log = { id: 'a', date: 0, focus: null, durationSeconds: 0, exercises: [], program: null };
    expect(logSummary(log, new WeightUnits(false))).toBe('0 exercises');
  });
});

describe('estimated 1RM display', () => {
  test('one decimal, not the two a converted estimate carries', () => {
    expect(new WeightUnits(true).estimate(74.69)).toBe('164.7 lb');
    expect(new WeightUnits(false).estimate(102.38)).toBe('102.4 kg');
    expect(new WeightUnits(false).estimate(100)).toBe('100 kg');
  });

  test('no estimate is a dash, not "BW"', () => {
    expect(new WeightUnits(false).estimate(undefined)).toBe('–');
    expect(new WeightUnits(false).estimate(0)).toBe('–');
  });
});

describe('report comparison', () => {
  test('a first week is new, not "up 1 vs last week"', () => {
    expect(change(1, 0)).toEqual({ kind: 'new' });
  });

  test('nothing either side is empty', () => {
    expect(change(0, 0)).toEqual({ kind: 'empty' });
  });

  test('ups, downs and ties against a real previous period', () => {
    expect(change(3, 2)).toEqual({ kind: 'up', by: 1 });
    expect(change(1, 4)).toEqual({ kind: 'down', by: 3 });
    expect(change(0, 2)).toEqual({ kind: 'down', by: 2 });
    expect(change(2, 2)).toEqual({ kind: 'same' });
  });
});

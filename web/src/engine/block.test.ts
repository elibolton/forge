import { describe, expect, test } from 'vitest';
import {
  DAY_MS, Gyms, type LoggedExercise, Planner, type WorkoutRecord, blockRIR, blockStatus, defaultPlan, fallingLifts,
  plannedWorkingSets,
} from './index';

const now = 1_800_000_000_000;
const day = (d: number) => now + d * DAY_MS;
const lift = (id: string, weight: number, reps: number, rir = 2): LoggedExercise =>
  ({ exerciseID: id, sets: [0, 1, 2].map(() => ({ weight, reps, rir, isWarmup: false })), targetReps: reps, targetRIR: rir });
const every2Days = (from: number, to: number, ex: (d: number) => LoggedExercise[] = () => [lift('bb-bench', 80, 8)]): WorkoutRecord[] => {
  const out: WorkoutRecord[] = [];
  for (let d = from; d <= to; d += 2) out.push({ date: day(d), focus: 'push', exercises: ex(d) });
  return out;
};

describe('Training blocks', () => {
  test('a first workout starts block 1, week 1', () => {
    const b = blockStatus([], now);
    expect([b.number, b.week, b.isDeload]).toEqual([1, 1, false]);
  });

  test('five loading weeks, then a deload, then a new block', () => {
    const h = every2Days(0, 60);
    expect(blockStatus(h, day(22)).week).toBe(4);
    const deload = blockStatus(h, day(36));
    expect([deload.week, deload.isDeload]).toEqual([6, true]);
    const next = blockStatus(h, day(43));
    expect([next.number, next.week, next.isDeload]).toEqual([2, 1, false]);
  });

  test('two weeks off starts a fresh block', () => {
    const h = [...every2Days(0, 20), ...every2Days(40, 44)];
    const b = blockStatus(h, day(45));
    expect([b.number, b.week]).toEqual([2, 1]);
    expect(blockStatus(every2Days(0, 10), day(30)).week).toBe(1);
  });

  test('maxes falling on two lifts bring the deload forward', () => {
    // Bench and squat get weaker every session through weeks 1–2.
    const h = every2Days(0, 13, (d) => [lift('bb-bench', 80 - d, 8), lift('bb-squat', 100 - d, 8)]);
    expect(fallingLifts(h)).toEqual(['bb-bench', 'bb-squat']);
    const b = blockStatus(h, day(15));
    expect([b.week, b.weeks, b.isDeload]).toEqual([3, 3, true]);
    expect(b.earlyReason).toMatch(/2 lifts/);
    expect(blockStatus(h, day(22)).number).toBe(2);
    // One lift falling isn't enough.
    const one = every2Days(0, 13, (d) => [lift('bb-bench', 80 - d, 8), lift('bb-squat', 100, 8)]);
    expect(blockStatus(one, day(15)).isDeload).toBe(false);
  });

  test('effort rises through the block and eases on the deload', () => {
    const at = (week: number, isDeload = false) => ({ number: 1, week, weeks: 6, isDeload, startedAt: now });
    expect([1, 2, 3, 4, 5].map((w) => blockRIR('buildMuscle', 'intermediate', at(w), true))).toEqual([3, 2, 2, 1, 1]);
    expect([1, 2, 3, 4, 5].map((w) => blockRIR('buildMuscle', 'intermediate', at(w), false))).toEqual([2, 1, 1, 1, 0]);
    expect(blockRIR('buildMuscle', 'beginner', at(5), true)).toBe(2);
    expect(blockRIR('buildMuscle', 'intermediate', at(6, true), true)).toBe(4);
  });
});

describe('Generated workouts across a block', () => {
  const make = (history: WorkoutRecord[]) => new Planner({ plan: defaultPlan({ sessionMinutes: 75 }), gym: Gyms.commercial(), history });
  const sets = (w: ReturnType<Planner['generate']>) => w.exercises.reduce((t, p) => t + plannedWorkingSets(p).length, 0);

  test('the deload week cuts sets, eases effort and says so', () => {
    const h = every2Days(0, 34);
    const loading = make(h).generate({ now: day(29), seed: 1, focus: 'push' });
    const deload = make(h).generate({ now: day(36), seed: 1, focus: 'push' });
    expect(deload.block?.isDeload).toBe(true);
    expect(sets(deload)).toBeLessThan(sets(loading) * 0.75);
    expect(deload.exercises.every((p) => p.targetRIR >= 3)).toBe(true);
    expect(deload.note).toMatch(/Deload week/);
    const bench = deload.exercises.find((p) => p.exercise.id === 'bb-bench');
    if (bench) expect(plannedWorkingSets(bench)[0].weight).toBeLessThan(80);
  });

  test('later weeks ask for more effort', () => {
    const h = every2Days(0, 34);
    const w1 = make(h.filter((r) => r.date < day(1))).generate({ now: day(1), seed: 1, focus: 'pull' });
    const w5 = make(h).generate({ now: day(30), seed: 1, focus: 'pull' });
    expect(w5.exercises[0].targetRIR).toBeLessThan(w1.exercises[0].targetRIR);
  });

  test('main lifts and most accessories stay the same within a block', () => {
    const history: WorkoutRecord[] = [];
    const picks: string[][] = [];
    for (let d = 0; d < 30; d += 3) {
      const w = make(history).generate({ now: day(d), seed: d, focus: 'push' });
      picks.push(w.exercises.map((p) => p.exercise.id));
      history.push({ date: day(d), focus: 'push', exercises: w.exercises.map((p) => ({
        exerciseID: p.exercise.id, targetReps: plannedWorkingSets(p)[0].reps, targetRIR: p.targetRIR,
        sets: plannedWorkingSets(p).map((s) => ({ weight: s.weight ?? 0, reps: s.reps, rir: p.targetRIR, isWarmup: false })),
      })) });
    }
    expect(new Set(picks.map((p) => p[0])).size).toBe(1);
    const first = new Set(picks[1]);
    for (const later of picks.slice(2)) {
      const kept = later.filter((id) => first.has(id)).length;
      expect(kept / later.length).toBeGreaterThanOrEqual(0.7);
    }
  });
});

import { describe, expect, test } from 'vitest';
import { completesProgramDay, newRecords, workoutLog } from './finishWorkout';
import { addMobility } from './mobility';
import { prTimeline } from './records';
import type { SessionState } from './session.svelte';

// Bug hunt P2: warm-up drills are logged as ordinary sets, so they used to finish a program day alone.
describe('Warm-up and cool-down drills are not lifting', () => {
  const ref = { programID: 'pplul8', week: 1, dayID: 'push', isDeload: false };
  const bench = (done: boolean) => ({
    id: 'b', exerciseID: 'bb-bench', restSeconds: 120, targetRIR: 2, targetReps: 8, rir: null, reasons: [],
    sets: [{ id: 's', weight: 80, reps: 8, isWarmup: false, isAMRAP: false, done }],
  });
  const withDrills = (benchDone: boolean): SessionState => {
    const st: SessionState = { startedAt: 1_000_000, focus: 'push', currentIndex: 0, exercises: [bench(benchDone)], program: ref };
    addMobility(st, ['chest'], { warmup: true, cooldown: true });
    for (const e of st.exercises) if (e.exerciseID !== 'bb-bench') for (const s of e.sets) s.done = true;
    return st;
  };

  test('ticking only the drills doesn\'t complete the program day', () => {
    const log = workoutLog(withDrills(false), 'x', 2_000_000);
    expect(log?.exercises.length).toBeGreaterThan(0);
    expect(completesProgramDay(log)).toBe(false);
    expect(completesProgramDay(workoutLog(withDrills(true), 'x', 2_000_000))).toBe(true);
  });

  test('drills never make a personal record', () => {
    const st = withDrills(false);
    for (const e of st.exercises) for (const s of e.sets) s.weight = 20;
    const log = workoutLog(st, 'x', 2_000_000)!;
    const drill = log.exercises[0].exerciseID;
    expect(newRecords(log.exercises, new Map([[drill, 1]]))).toEqual([]);
    const earlier = { id: 'a', date: 1, exercises: log.exercises.map((l) => ({ ...l, sets: l.sets.map((s) => ({ ...s, weight: 5 })) })) };
    expect(prTimeline([earlier, { id: 'b', date: 2, exercises: log.exercises }])).toEqual([]);
  });
});

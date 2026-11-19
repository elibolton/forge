import { describe, expect, test } from 'vitest';
import {
  Catalog, DAY_MS, type DayFocus, type Exercise, Gyms, type LoggedExercise, type LoggedSet, Planner, type UserPlan, type WorkoutRecord,
  blockStatus, defaultPlan, estimatedMinutes, estimatedOneRM, makeGym, makeScheme, oneRM, plannedWorkingSets, qualityOf,
  setRIR, unpair, workingLoad,
} from './index';
import { exerciseRecords, prTimeline } from '../lib/records';

// Regression tests for batch 2 of the bug hunt (docs/bug-hunt/builder.md, "wrong training advice").
const now = 1_800_000_000_000;
const daysAgo = (d: number) => now - d * DAY_MS;
const byID = (id: string) => Catalog.byID.get(id)!;
type S = [weight: number, reps: number, rir?: number | null];
const sess = (id: string, sets: S[], o: Partial<LoggedExercise> = {}): LoggedExercise =>
  ({ exerciseID: id, sets: sets.map(([weight, reps, rir]) => ({ weight, reps, rir: rir === undefined ? 2 : rir, isWarmup: false })), ...o });
const rec = (date: number, ...exercises: LoggedExercise[]): WorkoutRecord => ({ date, exercises });
const planner = (history: WorkoutRecord[] = [], plan: Partial<UserPlan> = {}, gym = Gyms.commercial(), catalog?: Exercise[]) =>
  new Planner({ plan: defaultPlan(plan), gym, history, ...(catalog ? { catalog } : {}) });
const working = (p: { sets: { isWarmup: boolean; weight: number | null; reps: number }[] }) => p.sets.filter((s) => !s.isWarmup);

describe('B1: unrated sets', () => {
  test('a set nobody rated counts at the prescribed effort, not as a set to failure', () => {
    expect(setRIR({ rir: null }, 3)).toBe(3);
    expect(setRIR({ rir: null })).toBe(2);
    expect(setRIR({ rir: null, type: 'failure' }, 3)).toBe(0);
    expect(setRIR({ rir: 1 }, 3)).toBe(1);
  });

  test('a simulated run where every rep is hit doesn\'t go backwards when sets are left unrated', () => {
    const simulate = (rir: number | null) => {
      const history: WorkoutRecord[] = [];
      const bench: number[] = [];
      for (let i = 0; i < 20; i++) {
        const date = now - (40 - i * 2) * DAY_MS;
        const w = planner(history, { goal: 'getStronger' }).generate({ now: date, seed: i + 1, focus: 'push' });
        const b = w.exercises.find((p) => p.exercise.id === 'bb-bench');
        if (b) bench.push(working(b)[0].weight!);
        history.push({
          date, focus: w.focus,
          exercises: w.exercises.map((p) => ({
            exerciseID: p.exercise.id, targetReps: working(p)[0].reps, targetRIR: p.targetRIR,
            sets: working(p).map((s) => ({ weight: s.weight ?? 0, reps: s.reps, rir, isWarmup: false })),
          })),
        });
      }
      return bench;
    };
    const rated = simulate(2), unrated = simulate(null);
    expect(unrated.length).toBeGreaterThan(10);
    expect(Math.max(...unrated)).toBeGreaterThan(unrated[0]);
    expect(Math.max(...unrated)).toBeGreaterThanOrEqual(Math.max(...rated) - 5);
  });

  test('the strength estimate and the next load are the same whether the sets were rated at target or not', () => {
    const history = (rir: number | null) =>
      [rec(daysAgo(3), sess('bb-bench', [[80, 5, rir], [80, 5, rir], [80, 5, rir]], { targetReps: 5, targetRIR: 2 }))];
    expect(estimatedOneRM('bb-bench', history(null), now)).toBeCloseTo(estimatedOneRM('bb-bench', history(2), now)!);
    const rated = planner(history(2), { goal: 'getStronger' }).prescribe(byID('bb-bench'), now);
    const unrated = planner(history(null), { goal: 'getStronger' }).prescribe(byID('bb-bench'), now);
    expect(working(unrated)[0].weight).toBe(working(rated)[0].weight);
    expect(working(unrated)[0].weight).toBeGreaterThanOrEqual(80);
    expect(unrated.reasons).toContain('Hit every rep last time, adding weight');
  });
});

describe('B2: double progression reads one weight', () => {
  test('a heavy top set doesn\'t pair its weight with the back-off sets\' reps', () => {
    const p = planner([rec(daysAgo(3), sess('db-curl', [[20, 3, 0], [14, 12], [14, 12], [14, 12]]))]).prescribe(byID('db-curl'), now);
    expect(working(p)[0].weight).toBe(14);
    expect(working(p)[0].reps).toBe(13);
  });

  test('a light set with few reps doesn\'t hide that every working set hit the top', () => {
    const p = planner([rec(daysAgo(3), sess('db-curl', [[14, 15], [14, 15], [14, 15], [8, 4]]))]).prescribe(byID('db-curl'), now);
    // A 2 kg step is a big jump at 14 kg, so it builds reps first rather than repeating "aim for 10".
    expect(working(p)[0].reps).toBeGreaterThan(15);
    expect(p.reasons.join(' ')).not.toContain('Same weight');
  });

  test('the working load is the weight most sets used, the heavier on a tie', () => {
    expect(workingLoad(sess('x', [[20, 3], [14, 12], [14, 12]]))?.load).toBe(14);
    expect(workingLoad(sess('x', [[40, 10], [45, 8]]))?.load).toBe(45);
    expect(workingLoad(sess('x', [[0, 10]]))).toBeUndefined();
  });
});

describe('B4, B13, B21: never 0 kg on a loaded exercise', () => {
  test('a big dumbbell step rounds light loads up to the lightest dumbbell', () => {
    for (const [gym, focus] of [
      [makeGym('lb', ['dumbbell', 'flatBench', 'adjustableBench'], true, { dumbbell: 20 }), 'push'],
      [makeGym('kg', ['dumbbell', 'flatBench', 'adjustableBench'], false, { dumbbell: 10 }), 'pull'],
    ] as const) {
      const w = planner([], { experience: 'beginner' }, gym).generate({ now, seed: 1, focus: focus as DayFocus });
      for (const p of w.exercises) for (const s of p.sets) if (s.weight !== null) expect(s.weight, p.exercise.id).toBeGreaterThan(0);
    }
  });

  test('a logged 0 kg reads as "no weight logged", and the next prescription is a real load', () => {
    const p = planner([rec(daysAgo(3), sess('db-rear-delt-fly', [[0, 15], [0, 15], [0, 15]]))]).prescribe(byID('db-rear-delt-fly'), now);
    expect(working(p)[0].weight).toBeGreaterThan(0);
    expect(p.reasons.join(' ')).toContain('No weight logged last time');
  });

  test('a loaded hold logged at 0 kg gets a weight again', () => {
    const p = planner([rec(daysAgo(3), sess('db-glute-bridge', [[0, 40], [0, 40]]))]).prescribe(byID('db-glute-bridge'), now);
    expect(working(p)[0].weight).toBeGreaterThan(0);
  });
});

describe('B5: loads below the empty bar', () => {
  test('a prescription well under the bar says so', () => {
    const p = planner([], { experience: 'beginner' }).prescribe(byID('bb-front-raise'), now);
    expect(working(p)[0].weight).toBe(20);
    expect(p.reasons.join(' ')).toContain('empty bar is heavier than planned');
  });

  test('generated workouts prefer something that can be loaded that light', () => {
    for (const focus of ['push', 'pull', 'upper', 'fullBody'] as DayFocus[]) {
      for (let seed = 1; seed <= 5; seed++) {
        const w = planner([], { experience: 'beginner' }).generate({ now, seed, focus });
        for (const p of w.exercises) expect(p.reasons.join(' '), `${focus} ${p.exercise.id}`).not.toContain('empty bar');
      }
    }
  });
});

describe('B6, B18: loaded exercises without load equipment', () => {
  test('step like plates and round to them', () => {
    const fresh = planner().prescribe(byID('incline-svend-press'), now);
    expect(working(fresh)[0].weight! % 2.5).toBeCloseTo(0);
    const after = planner([rec(daysAgo(3), sess('incline-svend-press', [[10, 18], [10, 18], [10, 18]]))]).prescribe(byID('incline-svend-press'), now);
    expect(working(after)[0].weight).toBe(12.5);
  });

  test('a custom weighted exercise with no equipment gets a loadable weight', () => {
    const vest: Exercise = { ...byID('push-up'), id: 'custom-vest-push-up', name: 'Vest Push Up', starterOneRM: 37 };
    const p = planner([], {}, Gyms.commercial(), [...Catalog.builtIn, vest]).prescribe(vest, now);
    expect(working(p)[0].weight! % 2.5).toBeCloseTo(0);
  });

  test('a load logged in another unit is rounded to this gym\'s steps', () => {
    const lb = makeGym('lb', ['dumbbell', 'flatBench'], true);
    const p = planner([rec(daysAgo(3), sess('db-curl', [[13, 11], [13, 11], [13, 11]]))], {}, lb).prescribe(byID('db-curl'), now);
    const pounds = working(p)[0].weight! * 2.2046226218;
    expect(Math.abs(pounds - Math.round(pounds / 5) * 5)).toBeLessThan(0.01);
  });
});

describe('B9, F2, F3: honest notes when equipment is missing', () => {
  test('a no-equipment pull day works what it can and names what it can\'t', () => {
    const w = planner([], {}, Gyms.bodyweight()).generate({ now, seed: 1, focus: 'pull' });
    expect(w.exercises.some((p) => p.exercise.primary.includes('upperBack'))).toBe(true);
    expect(w.uncovered).toEqual(expect.arrayContaining(['lats', 'biceps']));
    expect(w.note).toContain('no direct work');
    expect(w.note).not.toContain('Every muscle');
  });

  test('a no-equipment push day trains triceps with what there is', () => {
    const w = planner([], {}, Gyms.bodyweight()).generate({ now, seed: 1, focus: 'push' });
    expect(w.exercises.some((p) => p.exercise.primary.includes('triceps'))).toBe(true);
    expect(w.uncovered).toContain('sideDelts');
    expect(w.note).not.toContain('Every muscle');
  });

  test('nothing eligible at all says so', () => {
    const exclude = Object.fromEntries(Catalog.all.map((e) => [e.id, 'exclude' as const]));
    const w = planner([], { preferences: exclude }).generate({ now, seed: 1, focus: 'push' });
    expect(w.exercises).toEqual([]);
    expect(w.note).toContain('No exercise');
    expect(w.uncovered?.length).toBeGreaterThan(0);
  });

  test('a full gym still calls a short day complete', () => {
    const w = planner([], { sessionMinutes: 120 }).generate({ now, seed: 1, focus: 'pull' });
    expect(w.uncovered).toBeUndefined();
  });
});

describe('B8, F1: short sessions fit', () => {
  test('15 and 20 minute sessions stay inside the time', () => {
    for (const goal of ['buildMuscle', 'getStronger', 'powerlifting'] as const) {
      for (const minutes of [15, 20]) {
        for (const supersets of [false, true]) {
          for (const focus of ['push', 'pull', 'legs', 'upper', 'lower', 'fullBody'] as DayFocus[]) {
            const w = planner([], { goal, sessionMinutes: minutes, supersets }).generate({ now, seed: 1, focus });
            expect(w.estimatedMinutes, `${goal} ${minutes} ${focus} ${supersets}`).toBeLessThanOrEqual(minutes);
            expect(estimatedMinutes(w.exercises)).toBe(w.estimatedMinutes);
            for (const p of w.exercises) expect(plannedWorkingSets(p).length).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe('B7: custom exercise roles', () => {
  test('a custom adductor "squat" doesn\'t become the main quad lift', () => {
    const cossack: Exercise = {
      id: 'custom-cossack', name: 'Cossack', primary: ['adductors'], secondary: ['quads'], equipment: ['kettlebell'],
      pattern: 'squat', isCompound: true, level: 'beginner', starterOneRM: 30, jointsStressed: [], isTimed: false,
    };
    expect(qualityOf(cossack).roles).not.toContain('squatMain');
    const w = planner([], {}, makeGym('k', ['kettlebell', 'barbell', 'flatBench']), [...Catalog.builtIn, cossack])
      .generate({ now, seed: 1, focus: 'legs' });
    expect(w.exercises.map((p) => p.exercise.id)).not.toContain('custom-cossack');
  });

  test('a triceps-first press can\'t fill the main chest slot; a chest press still can', () => {
    const base = { secondary: [], equipment: [], isCompound: true, level: 'beginner', starterOneRM: 40, jointsStressed: [], isTimed: false } satisfies Partial<Exercise>;
    expect(qualityOf({ ...base, id: 'custom-a', name: 'a', primary: ['triceps'], pattern: 'horizontalPush' } as Exercise).roles).toEqual(['tricepsOther']);
    expect(qualityOf({ ...base, id: 'custom-b', name: 'b', primary: ['chest'], pattern: 'horizontalPush' } as Exercise).roles).toEqual(['pressFlat']);
  });
});

describe('B10: breaking up a superset', () => {
  test('the exercise left gets its normal rest', () => {
    const scheme = makeScheme('buildMuscle', 'intermediate');
    const p = planner();
    const a = { ...p.prescribe(byID('bb-rdl'), now), restSeconds: 30, supersetGroup: 'A' };
    const b = { ...p.prescribe(byID('machine-lateral-raise'), now), restSeconds: 120, supersetGroup: 'A' };
    expect(unpair([a], 'A', scheme)[0].restSeconds).toBe(scheme.restCompound);
    expect(unpair([b], 'A', scheme)[0].restSeconds).toBe(scheme.restIsolation);
    expect(unpair([a], 'A', scheme)[0].supersetGroup).toBeUndefined();
  });

  test('generated supersets that lost a partner rest normally', () => {
    const scheme = makeScheme('buildMuscle', 'intermediate');
    for (const focus of ['legs', 'push'] as DayFocus[]) {
      const w = planner([], { supersets: true, sessionMinutes: 30 }).generate({ now, seed: 1, focus });
      for (const p of w.exercises) {
        if (p.supersetGroup || p.exercise.isTimed) continue;
        expect(p.restSeconds, `${focus} ${p.exercise.id}`).toBe(p.exercise.isCompound ? scheme.restCompound : scheme.restIsolation);
      }
    }
  });
});

describe('B11: future-dated records', () => {
  test('don\'t count toward this week\'s sets or last time\'s load', () => {
    const future = [rec(now + 30 * DAY_MS, sess('bb-bench', Array.from({ length: 10 }, () => [200, 8] as S)))];
    const p = planner(future);
    expect(p.weeklySets(now).chest ?? 0).toBe(0);
    expect(working(p.prescribe(byID('bb-bench'), now))[0].weight).toBeLessThan(150);
    const w = p.generate({ now, seed: 1, focus: 'push' });
    const bench = w.exercises.find((x) => x.exercise.id === 'bb-bench');
    if (bench) expect(working(bench)[0].weight).toBeLessThan(150);
  });
});

describe('B12: beginner set cap', () => {
  test('strength goals keep the beginner cap of 3 sets', () => {
    expect(makeScheme('getStronger', 'beginner').maxSetsPerExercise).toBe(3);
    expect(makeScheme('powerlifting', 'beginner').maxSetsPerExercise).toBe(3);
    expect(makeScheme('getStronger', 'intermediate').maxSetsPerExercise).toBe(5);
  });
});

describe('B14, B15: deloads are lighter', () => {
  const weekly = (id: string, sets: S[], o: Partial<LoggedExercise> = {}) =>
    [35, 28, 21, 14, 7].map((d) => rec(daysAgo(d), sess(id, sets, o)));

  test('small dumbbell loads still drop in a deload', () => {
    const history = weekly('db-lateral-raise', [[8, 10], [8, 10], [8, 10]]);
    expect(blockStatus(history, now).isDeload).toBe(true);
    const p = planner(history).prescribe(byID('db-lateral-raise'), now);
    expect(working(p)[0].weight).toBeLessThan(8);
  });

  test('a strength main lift in a deload is lighter than the last training session', () => {
    const history = weekly('bb-bench', [[60, 3], [60, 3], [60, 3]], { targetReps: 3, targetRIR: 2 });
    for (let extra = 0; extra < 3; extra++) {
      // Different session counts land on different points of the wave.
      const h = [...history, ...Array.from({ length: extra }, (_, i) => rec(daysAgo(40 + i), sess('bb-bench', [[50, 5]])))];
      const p = planner(h, { goal: 'getStronger' }).prescribe(byID('bb-bench'), now);
      expect(working(p)[0].weight).toBeLessThan(60);
    }
  });
});

describe('B17: absurd logged weights', () => {
  test('Infinity and 1e9 never reach a prescription', () => {
    const history = [rec(daysAgo(3), sess('bb-bench', [[Infinity, 5]]), sess('cable-fly', [[1e9, 12]]))];
    const w = planner(history).generate({ now, seed: 1, focus: 'push' });
    for (const p of w.exercises) for (const s of p.sets) {
      if (s.weight !== null) expect(Number.isFinite(s.weight) && s.weight <= 1000, p.exercise.id).toBe(true);
    }
    expect(working(planner(history).prescribe(byID('cable-fly'), now))[0].weight).toBeLessThan(1000);
  });
});

describe('B19: block weeks across daylight saving', () => {
  test('week boundaries stay at local midnight', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const start = new Date(2027, 1, 8, 12).getTime();
      const history: WorkoutRecord[] = [];
      for (let d = 0; d <= 28; d += 7) history.push(rec(start + d * DAY_MS, sess('bb-bench', [[80, 8]])));
      const status = blockStatus(history, new Date(2027, 2, 15, 0, 30).getTime());
      expect(status.week).toBe(6);
      expect(status.isDeload).toBe(true);
    } finally {
      if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
    }
  });
});

describe('B20: Fresh Muscles when nothing has recovered', () => {
  test('says so', () => {
    const all = Catalog.all.filter((e) => e.pattern !== 'mobility');
    const history = [rec(now - 5 * 3_600_000, ...all.map((e) => sess(e.id, Array.from({ length: 6 }, () => [40, 10, 0] as S))))];
    const w = planner(history, { split: 'freshMuscles' }).generate({ now, seed: 1 });
    expect(w.fatigued).toBe(true);
    expect(w.note).toContain('rest day');
    expect(planner([], { split: 'freshMuscles' }).generate({ now, seed: 1 }).fatigued).toBeUndefined();
  });
});

describe('L11: timed holds have no e1RM', () => {
  const carry = (id: string, date: number, seconds: number) =>
    ({ id, date, exercises: [{ exerciseID: 'farmer-carry', sets: [{ weight: 40, reps: seconds, rir: 0, isWarmup: false } as LoggedSet] }] });

  test('a longer carry isn\'t a new estimated max', () => {
    expect(Catalog.byID.get('farmer-carry')?.isTimed).toBe(true);
    expect(prTimeline([carry('a', 1, 30), carry('b', 2, 60)])).toEqual([]);
    const r = exerciseRecords([{ date: 1, logged: carry('a', 1, 60).exercises[0] }]);
    expect(r.oneRM).toBeUndefined();
    expect(r.heaviest?.value).toBe(40);
    expect(r.mostReps?.value).toBe(60);
  });

  test('lifts still get one', () => {
    expect(oneRM(100, 5, 0)).toBeCloseTo(116.67, 1);
  });
});

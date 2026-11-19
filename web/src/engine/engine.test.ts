import { afterEach, describe, expect, test } from 'vitest';
import {
  Catalog, DAY_MS, type DayFocus, type Exercise, Gyms, type LoggedExercise, NameMatcher, Planner, type WorkoutRecord,
  computeRecovery, defaultPlan, estimatedOneRM, focusMuscles, guideFor, lossy, makeScheme, oneRM, parseHistory,
  plannedWorkingSets, readExercise, readGym, readLogged, readPlan, roundLoad, weightForReps, workingSets,
} from './index';

export const now = 1_800_000_000_000;
export const daysAgo = (d: number) => now - d * DAY_MS;

function session(id: string, weight: number, reps: number, sets = 3, rir: number | null = 2, target?: number): LoggedExercise {
  return { exerciseID: id, sets: Array.from({ length: sets }, () => ({ weight, reps, rir, isWarmup: false })), targetReps: target ?? reps };
}

const byID = (id: string) => Catalog.byID.get(id)!;

describe('Strength', () => {
  test('epley round trips', () => {
    const e = oneRM(100, 5, 2);
    expect(Math.abs(weightForReps(5, 2, e) - 100)).toBeLessThan(0.001);
    expect(oneRM(100, 1)).toBe(100);
  });
  test('rounds to loadable weight', () => {
    expect(roundLoad(61.2, 2.5, 20)).toBe(60);
    expect(roundLoad(61.3, 2.5, 20)).toBe(62.5);
    expect(roundLoad(10, 2.5, 20)).toBe(20);
  });
  test('discounts long layoffs', () => {
    const fresh = estimatedOneRM('bb-bench', [{ date: daysAgo(3), exercises: [session('bb-bench', 80, 5)] }], now)!;
    const stale = estimatedOneRM('bb-bench', [{ date: daysAgo(40), exercises: [session('bb-bench', 80, 5)] }], now)!;
    expect(stale).toBeLessThan(fresh * 0.9);
  });
});

const chestDay: WorkoutRecord = {
  date: daysAgo(1), focus: 'push', exercises: [
    session('bb-bench', 80, 6, 4, 1), session('db-incline-bench', 26, 8, 3, 1), session('cable-fly', 20, 12, 3, 1),
  ],
};

describe('Recovery', () => {
  test('trained muscles are fatigued', () => {
    const r = computeRecovery({ history: [chestDay], now });
    expect(r.chest).toBeLessThan(0.5);
    expect(r.triceps).toBeLessThan(1);
    expect(r.quads).toBe(1);
  });
  test('fully recovers within a week', () => {
    expect(computeRecovery({ history: [{ ...chestDay, date: daysAgo(7.1) }], now }).chest).toBe(1);
  });
  test('override replaces history', () => {
    const r = computeRecovery({ history: [chestDay], overrides: [{ muscle: 'chest', recovery: 0.9, date: now }], now });
    expect(Math.abs(r.chest - 0.9)).toBeLessThan(0.001);
  });
  test('cardio tires legs', () => {
    const r = computeRecovery({ history: [], external: [{ date: daysAgo(0.5), minutes: 60, muscles: ['quads', 'hamstrings', 'glutes', 'calves'] }], now });
    expect(r.quads).toBeLessThan(0.7);
    expect(r.chest).toBe(1);
  });
});

describe('Planner', () => {
  const planner = (plan = defaultPlan(), gym = Gyms.commercial(), history: WorkoutRecord[] = []) => new Planner({ plan, gym, history });

  test('respects equipment', () => {
    const w = planner(defaultPlan(), Gyms.bodyweight()).generate({ now, seed: 1 });
    expect(w.exercises.length).toBeGreaterThan(0);
    expect(w.exercises.every((p) => p.exercise.equipment.length === 0)).toBe(true);
  });

  test('respects injuries and exclusions', () => {
    const plan = defaultPlan({ split: 'pushPullLegs', injuries: ['knee'], preferences: { 'bb-deadlift': 'exclude' } });
    const w = planner(plan).generate({ now, seed: 3, focus: 'legs' });
    expect(w.exercises.every((p) => !p.exercise.jointsStressed.includes('knee'))).toBe(true);
    expect(w.exercises.some((p) => p.exercise.id === 'bb-deadlift')).toBe(false);
  });

  test('follows split rotation', () => {
    const w = planner(defaultPlan(), Gyms.commercial(), [{ date: daysAgo(1), focus: 'push', exercises: [session('bb-bench', 80, 6)] }]).generate({ now });
    expect(w.focus).toBe('pull');
    expect(w.exercises.every((p) => p.exercise.primary.some((m) => focusMuscles('pull').includes(m)))).toBe(true);
  });

  test('fresh muscles avoids what you just trained', () => {
    const w = planner(defaultPlan({ split: 'freshMuscles' }), Gyms.commercial(), [chestDay]).generate({ now });
    expect(w.targetMuscles).not.toContain('chest');
  });

  test('compounds come first', () => {
    const w = planner(defaultPlan({ goal: 'getStronger' })).generate({ now, seed: 7, focus: 'legs' });
    expect(w.exercises[0].exercise.isCompound).toBe(true);
  });

  test('duration scales exercise count', () => {
    const short = planner(defaultPlan({ sessionMinutes: 30 })).generate({ now, seed: 2, focus: 'fullBody' });
    const long = planner(defaultPlan({ sessionMinutes: 90 })).generate({ now, seed: 2, focus: 'fullBody' });
    expect(short.exercises.length).toBeLessThan(long.exercises.length);
    expect(long.estimatedMinutes).toBeLessThanOrEqual(90);
  });

  test('short strength session fits budget', () => {
    const w = planner(defaultPlan({ goal: 'getStronger', split: 'freshMuscles', sessionMinutes: 45 })).generate({ now, seed: 1 });
    expect(w.estimatedMinutes).toBeLessThanOrEqual(47);
    expect(w.exercises.length).toBeGreaterThanOrEqual(3);
  });

  test('no doubled isolations for one muscle', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const focus of ['push', 'pull', 'legs'] as DayFocus[]) {
        const w = planner().generate({ now, seed, focus });
        const targets = w.exercises.filter((p) => !p.exercise.isCompound).map((p) => [...p.exercise.primary].sort().join(','));
        expect(new Set(targets).size, `seed ${seed} ${focus}`).toBe(targets.length);
      }
    }
  });

  test('same seed same workout', () => {
    const a = planner().generate({ now, seed: 42, focus: 'upper' }).exercises.map((p) => p.exercise.id);
    const b = planner().generate({ now, seed: 42, focus: 'upper' }).exercises.map((p) => p.exercise.id);
    expect(a).toEqual(b);
  });

  test('adds weight after hitting reps', () => {
    const p = planner(defaultPlan(), Gyms.commercial(), [{ date: daysAgo(3), focus: 'push', exercises: [session('bb-bench', 80, 8, 3, 2, 8)] }]);
    const next = p.prescribeWith(byID('bb-bench'), makeScheme('buildMuscle', 'intermediate'), now, []);
    const first = plannedWorkingSets(next)[0];
    const sameReps = weightForReps(first.reps, 2, oneRM(80, 8, 2));
    expect(first.weight!).toBeGreaterThan(roundLoad(sameReps, 2.5, 20) - 0.01);
    expect(next.reasons.some((r) => r.includes('adding weight'))).toBe(true);
  });

  test('backs off after missing twice', () => {
    const history = [
      { date: daysAgo(3), exercises: [session('bb-squat', 100, 4, 3, 0, 8)] },
      { date: daysAgo(6), exercises: [session('bb-squat', 100, 5, 3, 0, 8)] },
    ];
    const next = planner(defaultPlan(), Gyms.commercial(), history).prescribeWith(byID('bb-squat'), makeScheme('buildMuscle', 'intermediate'), now, []);
    expect(next.reasons.some((r) => r.includes('backing off'))).toBe(true);
  });

  test('new exercise scales from related lift', () => {
    const p = planner(defaultPlan(), Gyms.commercial(), [{ date: daysAgo(2), exercises: [session('bb-bench', 100, 5)] }]);
    const est = p.startingOneRM(byID('db-bench'), now);
    expect(Math.abs(est - oneRM(100, 5, 2) * 28 / 70 * 0.9)).toBeLessThan(0.01);
  });

  test('simulated eight weeks', () => {
    const history: WorkoutRecord[] = [];
    const bench: number[] = [];
    for (let day = 56; day > 0; day -= 2) {
      const date = daysAgo(day);
      const w = new Planner({ plan: defaultPlan(), gym: Gyms.commercial(), history }).generate({ now: date });
      expect(w.exercises.length).toBeGreaterThanOrEqual(3);
      expect(w.estimatedMinutes).toBeLessThanOrEqual(65);
      const logged = w.exercises.map((p): LoggedExercise => ({
        exerciseID: p.exercise.id,
        sets: p.sets.map((s) => ({ weight: s.weight ?? 0, reps: s.reps, rir: s.isWarmup ? null : p.targetRIR, isWarmup: s.isWarmup })),
        targetReps: plannedWorkingSets(p)[0]?.reps,
      }));
      const b = w.exercises.find((p) => p.exercise.id === 'bb-bench');
      if (b) { const s = plannedWorkingSets(b)[0]; bench.push(oneRM(s.weight!, s.reps, 2)); }
      history.push({ date, focus: w.focus, exercises: logged });
    }
    expect(new Set(history.map((h) => h.focus))).toEqual(new Set(['push', 'pull', 'legs']));
    if (bench.length >= 2) expect(bench[bench.length - 1]).toBeGreaterThan(bench[0]);
  });
});

describe('Import', () => {
  test('reads Fitbod-style export', () => {
    const csv = `Date,Exercise,Reps,Weight(kg),Duration(s),Distance(m),Incline,Resistance,isWarmup,Note,multiplier
2026-10-01 18:00:00 +0000,Barbell Bench Press,10,40,0,0,0,0,true,,1
2026-10-01 18:05:00 +0000,Barbell Bench Press,8,70,0,0,0,0,false,,1
2026-10-01 18:09:00 +0000,Barbell Bench Press,8,70,0,0,0,0,false,,1
2026-10-01 18:20:00 +0000,Dumbbell Fly,12,14,0,0,0,0,false,,2
2026-10-03 18:00:00 +0000,Plank,0,0,60,0,0,0,false,,1
2026-10-03 18:10:00 +0000,Zercher Carry,5,60,0,0,0,0,false,,1`;
    const r = parseHistory(csv, true);
    expect(r.workouts.length).toBe(2);
    const bench = r.workouts[0].exercises.find((e) => e.exerciseID === 'bb-bench')!;
    expect(bench.sets.length).toBe(3);
    expect(bench.sets[0].isWarmup).toBe(true);
    expect(workingSets(bench)[0].weight).toBe(70);
    expect(r.workouts[0].exercises.some((e) => e.exerciseID === 'db-fly')).toBe(true);
    expect(r.workouts[1].exercises[0].sets[0].reps).toBe(60);
    expect(r.unmatched['Zercher Carry']).toBe(1);
  });

  test('reads Strong-style export in pounds', () => {
    const csv = `Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE
2026-10-05 07:30:00;Legs;1h;Squat (Barbell);W;135;5;0;0;;;
2026-10-05 07:30:00;Legs;1h;Squat (Barbell);1;225;5;0;0;;;8
2026-10-05 07:30:00;Legs;1h;Lat Pulldown (Cable);1;120;10;0;0;;;
2026-10-05 07:30:00;Legs;1h;"Romanian Deadlift (Barbell)";1;185;8;0;0;;;`;
    const ex = parseHistory(csv, true).workouts[0].exercises;
    const squat = ex.find((e) => e.exerciseID === 'bb-squat')!;
    expect(squat.sets[0].isWarmup).toBe(true);
    expect(Math.abs(workingSets(squat)[0].weight - 102.06)).toBeLessThan(0.05);
    expect(workingSets(squat)[0].rir).toBe(2);
    expect(ex.some((e) => e.exerciseID === 'lat-pulldown')).toBe(true);
    expect(ex.some((e) => e.exerciseID === 'bb-rdl')).toBe(true);
  });

  test('reports missing columns', () => {
    expect(() => parseHistory('foo,bar\n1,2', false)).toThrow(/columns/);
  });

  test('equipment must agree', () => {
    const m = new NameMatcher(Catalog.all);
    expect(m.match('Bench Press (Dumbbell)')?.id).toBe('db-bench');
    expect(m.match('Bicep Curl (Cable)')?.id).toBe('cable-curl');
    expect(m.match('Hammer Curl (Dumbbell)')?.id).toBe('db-hammer-curl');
  });

  test('Fitbod names match exactly', () => {
    const m = new NameMatcher(Catalog.all);
    expect(m.match('Air Squats')?.id).toBe('air-squat');
    expect(m.match('Concentration Curl')?.id).toBe('concentration-curl');
    expect(m.match('Split Squat')?.id).toBe('split-squat');
    expect(m.match('Calf Raise')?.id).toBe('bw-calf-raise');
    expect(m.match('Prone Hip Circles Forward')?.id).toBe('prone-hip-circle');
    expect(m.match('Walking')).toBeUndefined();
  });

  test('mobility is never planned or counted as fatigue', () => {
    const t = Date.now();
    const stretch: LoggedExercise = { exerciseID: 'tricep-stretch', sets: [{ weight: 0, reps: 30, rir: null, isWarmup: false }] };
    expect(computeRecovery({ history: [{ date: t, exercises: [stretch] }], now: t }).triceps).toBe(1);
    for (const focus of ['push', 'pull', 'legs', 'fullBody'] as DayFocus[]) {
      const w = new Planner({ plan: defaultPlan(), gym: Gyms.commercial(), history: [] }).generate({ now: t, seed: 1, focus });
      expect(w.exercises.some((p) => p.exercise.pattern === 'mobility')).toBe(false);
    }
  });
});

describe('Storage compatibility', () => {
  test('reads plan saved by earlier version', () => {
    const plan = readPlan(JSON.parse('{"experience":"intermediate","goal":"reduceBodyweight","injuries":["knee"],"preferences":{"bb-bench":"more"},"sessionMinutes":60,"split":"pushPullLegs","variability":"consistent","warmUpSets":false}'));
    expect(plan.goal).toBe('reduceBodyweight');
    expect(plan.variability).toBe('consistent');
    expect(plan.warmUpSets).toBe(false);
    expect(plan.injuries).toEqual(['knee']);
    expect(plan.preferences['bb-bench']).toBe('more');
  });
  test('plan missing fields gets defaults', () => {
    const plan = readPlan({ goal: 'getStronger' });
    expect(plan.goal).toBe('getStronger');
    expect(plan.sessionMinutes).toBe(defaultPlan().sessionMinutes);
    expect(plan.warmUpSets).toBe(defaultPlan().warmUpSets);
  });
  test('unknown values are ignored', () => {
    const plan = readPlan({ goal: 'yoga', injuries: ['knee', 'tail'], preferences: { 'bb-bench': 'sometimes', 'db-fly': 'less' } });
    expect(plan.goal).toBe(defaultPlan().goal);
    expect(plan.injuries).toEqual(['knee']);
    expect(plan.preferences).toEqual({ 'db-fly': 'less' });
  });
  test('reads gyms', () => {
    const g = readGym({ equipment: ['dumbbell', 'bench', 'hoverboard'], id: 'x', increments: { dumbbell: 2.5 }, name: 'Home', usesPounds: true })!;
    expect(g.name).toBe('Home');
    expect(g.equipment).toEqual(['dumbbell', 'bench']);
    expect(g.increments.dumbbell).toBe(2.5);
    expect(g.usesPounds).toBe(true);
  });
  test('one bad entry does not lose the rest', () => {
    const json = JSON.parse('[{"exerciseID":"bb-bench","sets":[{"isWarmup":false,"reps":8,"rir":2,"weight":40},{"reps":"lots"},{"isWarmup":true,"reps":10,"weight":20}],"targetReps":8},{"sets":[]},{"exerciseID":"db-fly","sets":[{"reps":12,"weight":14}]}]');
    const logged = lossy(json, readLogged);
    expect(logged.map((l) => l.exerciseID)).toEqual(['bb-bench', 'db-fly']);
    expect(logged[0].sets.length).toBe(3);
    expect(logged[0].sets[1].reps).toBe(0);
    expect(logged[1].sets[0].isWarmup).toBe(false);
  });
  test('unknown exercise is a placeholder, not a crash', () => {
    const e = Catalog.exercise('zercher-good-morning');
    expect(e.name).toBe('Zercher Good Morning');
    expect(Catalog.exercise('bb-bench').name).toBe('Barbell Bench Press');
    const history = [{ date: now - DAY_MS, exercises: [{ exerciseID: e.id, sets: [{ weight: 60, reps: 5, isWarmup: false }] }] }];
    computeRecovery({ history, now });
    new Planner({ plan: defaultPlan(), gym: Gyms.commercial(), history }).generate({ now });
  });
});

describe('Custom exercises', () => {
  const custom: Exercise = {
    id: 'custom-landmine-press', name: 'Landmine Press', primary: ['shoulders'], secondary: ['chest', 'triceps'],
    equipment: ['barbell'], pattern: 'verticalPush', isCompound: true, level: 'beginner', starterOneRM: 40, jointsStressed: [],
    isTimed: false, notes: 'Wedge the bar in a corner.\nPress up and forward.',
  };
  afterEach(() => Catalog.setCustom([]));

  test('custom exercises join the catalog and planner', () => {
    Catalog.setCustom([custom]);
    expect(Catalog.byID.get(custom.id)?.name).toBe('Landmine Press');
    const p = new Planner({ plan: defaultPlan({ variability: 'variable' }), gym: Gyms.commercial(), history: [] });
    expect(p.isEligible(custom)).toBe(true);
    expect(p.alternatives(byID('bb-ohp')).some((e) => e.id === custom.id)).toBe(true);
    expect(guideFor(custom)?.steps).toEqual(['Wedge the bar in a corner.', 'Press up and forward.']);
  });
  test('custom only accepts custom ids', () => {
    Catalog.setCustom([{ ...custom, id: 'bb-bench', name: 'Fake' }]);
    expect(Catalog.byID.get('bb-bench')?.name).toBe('Barbell Bench Press');
  });
  test('custom exercise survives storage round trip', () => {
    expect(readExercise(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
    const partial = readExercise({ id: 'custom-x', name: 'Thing', primary: ['chest', 'wings'] })!;
    expect(partial.primary).toEqual(['chest']);
    expect(partial.equipment).toEqual([]);
    expect(partial.notes).toBeUndefined();
  });
  test('import uses custom exercises and manual matches', () => {
    Catalog.setCustom([custom]);
    const csv = `Date,Exercise,Reps,Weight(kg),isWarmup
2026-10-01 18:00:00 +0000,Landmine Press,8,30,false
2026-10-01 18:05:00 +0000,Zercher Carry,5,60,false`;
    const auto = parseHistory(csv, false);
    expect(auto.workouts[0].exercises.map((e) => e.exerciseID)).toEqual(['custom-landmine-press']);
    expect(auto.unmatched['Zercher Carry']).toBe(1);
    const manual = parseHistory(csv, false, { 'Zercher Carry': 'bb-rdl' });
    expect(manual.unmatched).toEqual({});
    expect(manual.workouts[0].exercises.map((e) => e.exerciseID)).toContain('bb-rdl');
  });
  test('every built-in has instructions', () => {
    expect(Catalog.builtIn.filter((e) => !guideFor(e)).map((e) => e.id)).toEqual([]);
  });
  test('starter suggestion uses similar exercises', () => {
    const s = Catalog.suggestedStarterOneRM(['shoulders'], ['dumbbell'], false);
    expect(s).toBeGreaterThan(5);
    expect(s).toBeLessThan(20);
    expect(Catalog.suggestedStarterOneRM(['quads'], ['barbell', 'squatRack'], true)).toBeGreaterThan(50);
  });
});

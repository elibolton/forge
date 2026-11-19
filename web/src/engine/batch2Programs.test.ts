import { describe, expect, test } from 'vitest';
import {
  DAY_MS, Gyms, Programs, type ResolvedPrescription, type WorkoutRecord, Catalog, checkInDue, completeDay, effortRIR,
  gymFitsProgramExercise, gymHas, newProgress, nextLoad, repsDropped, resolveSession, skipDay, suggest, swappedSlot,
} from './index';

// Bug hunt batch 2, programs (P3–P11, P13, P15).

const now = 1_800_000_000_000;
const daysAgo = (d: number) => now - d * DAY_MS;
const program = Programs.pplul8;
const gym = Gyms.homeBarbell();
const commercial = Gyms.commercial();

function rx(slot: string, week: number): ResolvedPrescription {
  return resolveSession(program, slot.split('.')[0], week)!.exercises.find((e) => e.slot.id === slot)!;
}

/** `slot` resolved as if swapped to `exerciseID`, the way the program day does it. */
function swapped(slot: string, week: number, exerciseID: string): ResolvedPrescription {
  const dayID = slot.split('.')[0];
  const p = { ...program, days: program.days.map((d) => d.id !== dayID ? d : {
    ...d, exercises: d.exercises.map((s) => (s.id === slot ? swappedSlot(s, exerciseID) : s)),
  }) };
  return resolveSession(p, dayID, week)!.exercises.find((e) => e.slot.id === slot)!;
}

interface SetSpec { weight: number; reps: number; rir?: number | null; type?: 'failure' | 'drop' }

function logged(p: ResolvedPrescription, sets: SetSpec[], date: number, o: { week?: number; isDeload?: boolean } = {}): WorkoutRecord {
  return {
    date,
    exercises: [{ exerciseID: p.slot.exerciseID, sets: sets.map((s) => ({ isWarmup: false, rir: null, ...s })),
      targetReps: p.reps.lower, slotID: p.slot.id, repRange: p.reps, targetRIR: effortRIR(p.effort)?.low ?? null }],
    program: { programID: program.id, week: o.week ?? p.week, dayID: p.slot.id.split('.')[0], isDeload: o.isDeload ?? p.isDeload },
  };
}
const same = (weight: number, reps: number[], rir: number | null = null): SetSpec[] => reps.map((r) => ({ weight, reps: r, rir }));

describe('Swapped exercises take their own load step, effort and laterality (P3)', () => {
  test('Nordic curl swapped to a dumbbell leg curl gets a load and an RIR target', () => {
    const p = swapped('legs.3', 3, 'prone-db-leg-curl');
    expect(p.slot.loadStep).toBe('dumbbell');
    expect(p.effort.type).toBe('rir');
    expect(p.slot.weekOverrides).toEqual({});
    expect(p.slot.notes).toEqual([]);
    const s = suggest(p, { history: [], gym, now });
    expect(s.weight).toBeGreaterThan(0);
    expect(s.reason).not.toContain('Lower as slowly');
  });

  test('a per-leg slot swapped to a two-legged exercise is no longer per leg', () => {
    const p = swapped('legs.4', 2, 'seated-db-calf-raise');
    expect(p.slot.laterality).toBe('bilateral');
    expect(p.slot.sideRest).toBeUndefined();
    expect(swapped('legs.2', 2, 'db-lunge').slot.laterality).toBe('perLeg');
  });

  test('db fly swapped to cable fly moves up by the cable stack, not "+0 kg"', () => {
    const p = swapped('push.3', 3, 'cable-fly');
    expect(p.slot.loadStep).toBe('cablePin');
    // +5 kg on 20 kg is a big jump: the range is extended first, and the jump named is the stack's.
    const s = suggest(p, { history: [logged(p, same(20, [15, 15]), daysAgo(7))], gym: commercial, now });
    expect(s.action).toEqual({ type: 'extendRange', by: 4 });
    expect(s.reason).toContain('+5 kg');
    const progress = newProgress(program.id, now, 4);
    progress.rangeExtensions['push.3'] = 4;
    const s2 = suggest(swapped('push.3', 4, 'cable-fly'), { progress, history: [logged(p, same(20, [19, 19]), daysAgo(7))], gym: commercial, now });
    expect(s2.weight).toBe(25);
    expect(s2.reason).not.toContain('+0');
  });

  test('swapping to the same exercise changes nothing', () => {
    const slot = rx('push.1', 2).slot;
    expect(swappedSlot(slot, slot.exerciseID)).toBe(slot);
  });
});

describe('The next load is always at least one loadable step up (P4)', () => {
  test('weighted dip with a 1 kg dumbbell step still goes up on the plate grid', () => {
    const p = rx('upper.2', 3);
    const g = { ...commercial, increments: { dumbbell: 1 } };
    const s = suggest(p, { history: [logged(p, same(40, [12, 12]), daysAgo(7))], gym: g, now });
    expect(s.weight).toBe(42.5);
    expect(s.reason).not.toContain('+0');
  });

  test('bench with a 6 kg barbell step goes up 6 kg', () => {
    const g = { ...commercial, increments: { barbell: 6 } };
    expect(nextLoad(80, 'upperBarbell', Catalog.exercise('bb-bench'), g)).toBe(86);
    const p = rx('push.1', 3);
    expect(suggest(p, { history: [logged(p, same(80, [8, 8, 8]), daysAgo(7))], gym: g, now }).weight).toBe(86);
  });
});

describe('Calibration and last-set failure (P5)', () => {
  test('a week 1 last set to failure does not block the load increase', () => {
    const w1 = rx('push.5', 1);
    const h = [logged(w1, [{ weight: 50, reps: 15, rir: 2 }, { weight: 50, reps: 15, rir: 2 }, { weight: 50, reps: 15, rir: 0, type: 'failure' }], daysAgo(7))];
    const s = suggest(rx('push.5', 2), { history: h, gym, now });
    expect(s.weight).toBe(55);
    expect(s.reason).toContain('Top of the range');
  });

  test('"0 RIR on the last set" does not block it either', () => {
    const w = rx('upper.6b', 5);
    const h = [logged(w, [{ weight: 30, reps: 12, rir: 1 }, { weight: 30, reps: 12, rir: 1 }, { weight: 30, reps: 12, rir: 0 }], daysAgo(7))];
    expect(suggest(rx('upper.6b', 6), { history: h, gym, now }).weight).toBeGreaterThan(30);
  });
});

describe('Restarting a program (P6)', () => {
  const w = (week: number) => rx('legs.1', week);
  const oldRun = [
    logged(w(8), same(90, [5, 5]), daysAgo(3), { isDeload: true }),
    logged(w(7), same(100, [8, 8, 8, 8]).map((s, i) => ({ ...s, reps: i === 3 ? 7 : 8 })), daysAgo(10)),
    logged(w(6), same(100, [8, 8, 8, 7]), daysAgo(17)),
    logged(w(5), same(100, [8, 8, 8, 7]), daysAgo(24)),
  ];

  test('builds on the last real week, not the deload', () => {
    const s = suggest(w(1), { progress: newProgress(program.id, now), history: oldRun, gym, now });
    expect(s.weight).toBe(100);
  });

  test('the old run does not count as a stall in the new one', () => {
    const s = suggest(w(1), { progress: newProgress(program.id, now), history: oldRun, gym, now });
    expect(s.action).toBeUndefined();
    // Without a program run to go by, the same history is a stall.
    expect(suggest(w(4), { history: oldRun.slice(1), gym, now }).action).toEqual({ type: 'dropSet' });
  });
});

describe('Fatigue flag reads only the current run (P7)', () => {
  test('newest log per slot wins, and older runs are ignored', () => {
    const p1 = rx('push.1', 1), p2 = rx('push.1', 2);
    const run2Start = daysAgo(20);
    const h = [
      logged(p2, same(80, [8, 8, 8]), daysAgo(1)),
      logged(p1, same(80, [6, 6, 6]), daysAgo(8)),
      logged(p2, same(80, [6, 6, 6]), daysAgo(30)),
      logged(p1, same(80, [8, 8, 8]), daysAgo(37)),
    ];
    expect(repsDropped(h, program.id, 2, run2Start)).toEqual([]);
    // Even without a start date, the newest week-2 log (an improvement) decides.
    expect(repsDropped(h, program.id, 2)).toEqual([]);
  });
});

describe('Holding the top of the range is not a stall (P8)', () => {
  test('Nordics at 8,8,8 for three weeks', () => {
    const h = [5, 4, 3].map((week, i) => logged(rx('legs.3', week), same(0, [8, 8, 8]), daysAgo(7 * (i + 1))));
    const s = suggest(rx('legs.3', 6), { history: h, gym, now });
    expect(s.action).toBeUndefined();
    expect(s.reason).not.toContain('drop a set');
  });
});

describe('Time away (P9)', () => {
  test('four months off eases back in instead of adding load', () => {
    const p = rx('legs.1', 4);
    const s = suggest(p, { history: [logged(p, same(140, [8, 8, 8, 8]), daysAgo(120))], gym, now });
    expect(s.weight!).toBeLessThan(140);
    expect(s.reason).toContain('weeks away');
  });

  test('a normal week between sessions still progresses', () => {
    const p = rx('legs.1', 4);
    expect(suggest(p, { history: [logged(p, same(140, [8, 8, 8, 8]), daysAgo(7))], gym, now }).weight).toBe(145);
  });
});

describe('The same exercise in two slots (P10)', () => {
  test('each slot reads its own sets', () => {
    const l5 = rx('lower.5', 2);
    const l6 = swapped('lower.6', 2, 'seated-db-calf-raise');
    const record: WorkoutRecord = {
      date: daysAgo(7),
      exercises: [
        { exerciseID: 'seated-db-calf-raise', sets: same(20, [20, 20, 20]).map((s) => ({ ...s, isWarmup: false })), targetReps: 12, slotID: 'lower.5', repRange: l5.reps, targetRIR: 0 },
        { exerciseID: 'seated-db-calf-raise', sets: same(40, [12, 12, 12]).map((s) => ({ ...s, isWarmup: false })), targetReps: 12, slotID: 'lower.6', repRange: l6.reps, targetRIR: 0 },
      ],
      program: { programID: program.id, week: 1, dayID: 'lower', isDeload: false },
    };
    const s = suggest(l6, { history: [record], gym, now });
    expect(s.weight).toBe(40);
  });
});

describe('Home gym fits the program (P11)', () => {
  test('dumbbells stand in for a dip belt on the weighted dip', () => {
    const dip = Catalog.exercise('weighted-dip');
    expect(gymHas(gym, dip)).toBe(false);
    expect(gymFitsProgramExercise(gym, dip)).toBe(true);
    const noDumbbells = { ...gym, equipment: gym.equipment.filter((e) => e !== 'dumbbell') };
    expect(gymFitsProgramExercise(noDumbbells, dip)).toBe(false);
  });
});

describe('Check-ins are not lost (P13)', () => {
  test('a fully skipped week carries the last trained week\'s check-in over', () => {
    const p = newProgress(program.id, now);
    for (const d of ['push', 'pull', 'legs', 'upper', 'lower']) completeDay(p, d, 1, program);
    for (const d of ['push', 'pull', 'legs', 'upper', 'lower']) skipDay(p, d, program);
    expect(p.week).toBe(3);
    expect(checkInDue(p, program)).toBe(1);
    p.checkIns[1] = { jointPain: false, stillSore: false, poorSleepOrMotivation: false, repsDropped: false };
    expect(checkInDue(p, program)).toBeUndefined();
  });
});

describe('0 kg on a loaded exercise (P15)', () => {
  test('a session saved with no weight falls back to a starting load', () => {
    const p = rx('push.2', 2);
    const s = suggest(p, { history: [logged(p, same(0, [11, 11, 11]), daysAgo(7))], gym, now });
    expect(s.weight).toBeGreaterThan(0);
  });

  test('a session with only drop sets is skipped', () => {
    const p = rx('push.1', 2);
    const h = [
      logged(p, [{ weight: 60, reps: 8, type: 'drop' }], daysAgo(3)),
      logged(p, same(80, [8, 8, 8]), daysAgo(7)),
    ];
    expect(suggest(p, { history: h, gym, now }).weight).toBe(82.5);
  });
});

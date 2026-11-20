// Regression tests for the ship-audit engine fixes (docs/ship-audit/bugs.md, N1–N16).
import { describe, expect, test } from 'vitest';
import {
  type BlockCheckIn, type BlockCheckIns, Catalog, DAY_MS, type Gym, type LoggedExercise, POUNDS_PER_KG, Planner, Programs,
  type WorkoutRecord, blockCheckInDue, blockStatus, blockWeekStart, defaultPlan, effortRIR, gymIncrement, gymRound, gymRoundUp,
  makeGym, nextLoad, plateSides, readGym, resolveSession, stepTooFine, suggest,
} from './index';

const now = 1_800_000_000_000;
const day = (d: number) => now + d * DAY_MS;
const daysAgo = (d: number) => now - d * DAY_MS;
const stock = (...w: (number | [number, number])[]) => w.map((x) => (Array.isArray(x) ? { weight: x[0], pairs: x[1] } : { weight: x }));
const gymWith = (over: Partial<Gym> = {}): Gym => ({
  ...makeGym('Test', ['barbell', 'flatBench', 'squatRack', 'dipStation', 'dipBelt', 'dumbbell', 'pullUpBar']), ...over,
});
const bench = Catalog.exercise('bb-bench');
const dip = Catalog.exercise('weighted-dip');
const plan = defaultPlan({ goal: 'buildMuscle', experience: 'intermediate' });
const sets = (weight: number, reps: number, n = 3) => Array.from({ length: n }, () => ({ weight, reps, rir: 2, isWarmup: false }));
const session = (id: string, weight: number, reps: number, date: number, extra: Partial<WorkoutRecord> = {}): WorkoutRecord =>
  ({ date, focus: 'push', exercises: [{ exerciseID: id, sets: sets(weight, reps) }], ...extra });
/** The working weight the planner prescribes, with its reasons. */
const prescribe = (gym: Gym, history: WorkoutRecord[], e = bench) => {
  const p = new Planner({ plan, gym, history }).prescribe(e, now);
  const working = p.sets.filter((s) => !s.isWarmup);
  return { weight: working[0].weight!, reps: working[0].reps, reasons: p.reasons.join(' | ') };
};

describe('N1: a step finer than the plates never gets stuck', () => {
  test('2.5 kg step with 20/10/5/2.5 plates: 100 × 12 twice goes to 105', () => {
    const gym = gymWith({ plates: stock(20, 10, 5, 2.5), increments: { barbell: 2.5 } });
    const r = prescribe(gym, [session('bb-bench', 100, 12, daysAgo(3)), session('bb-bench', 100, 12, daysAgo(6))]);
    expect(r.weight).toBe(105);
    expect(r.reasons).toContain('adding weight');
  });

  test('in lb: a 2.5 lb step with 2.5 lb plates moves 135 on to 140', () => {
    const gym = gymWith({ usesPounds: true, plates: stock(45, 25, 10, 5, 2.5), increments: { barbell: 2.5 } });
    const lb = 135 / POUNDS_PER_KG;
    const r = prescribe(gym, [session('bb-bench', lb, 12, daysAgo(3)), session('bb-bench', lb, 12, daysAgo(6))]);
    expect(r.weight * POUNDS_PER_KG).toBeCloseTo(140);
  });

  test('any step of 2 kg or less still moves on', () => {
    for (const step of [0.5, 1, 1.25, 1.5, 2]) {
      const gym = gymWith({ plates: stock(20, 10, 5, 2.5), increments: { barbell: step } });
      expect(prescribe(gym, [session('bb-bench', 100, 12, daysAgo(3))]).weight, `step ${step}`).toBe(105);
    }
  });

  test('a step finer than the standard plates (no list) also lands on what they make', () => {
    const gym = gymWith({ increments: { barbell: 1 } });
    // Standard kg plates go down to 1.25: 2.5 kg jumps.
    expect(prescribe(gym, [session('bb-bench', 100, 12, daysAgo(3))]).weight).toBe(102.5);
  });

  test('the strength path (load from the estimated max) moves on too', () => {
    const gym = gymWith({ plates: stock(20, 10, 5, 2.5), increments: { barbell: 2.5 } });
    const strong = defaultPlan({ goal: 'getStronger', experience: 'beginner' });
    const p1 = new Planner({ plan: strong, gym, history: [] }).prescribe(bench, daysAgo(3));
    const reps = p1.sets.find((s) => !s.isWarmup)!.reps;
    const last: WorkoutRecord = { date: daysAgo(3), exercises: [{ exerciseID: 'bb-bench', sets: sets(100, reps), targetReps: reps, targetRIR: 2 }] };
    const p = new Planner({ plan: strong, gym, history: [last] }).prescribe(bench, now);
    expect(p.sets.find((s) => !s.isWarmup)!.weight!).toBeGreaterThan(100);
  });

  test('Settings: a step finer than the plates is flagged with the plates\' jump', () => {
    expect(stepTooFine(gymWith({ plates: stock(20, 10, 5, 2.5), increments: { barbell: 2.5 } }), 'barbell')).toBe(5);
    expect(stepTooFine(gymWith({ plates: stock(20, 10, 5, 2.5), increments: { barbell: 5 } }), 'barbell')).toBe(0);
    expect(stepTooFine(gymWith({ plates: stock(20, 10, 5, 2.5) }), 'barbell')).toBe(0);
    expect(stepTooFine(gymWith({ increments: { barbell: 1 } }), 'barbell')).toBe(2.5);
    expect(stepTooFine(gymWith({ increments: { dumbbell: 0.5 } }), 'dumbbell')).toBe(0);
  });

  test('the program path moves on as well', () => {
    const gym = gymWith({ plates: stock(20, 10, 5, 2.5), increments: { barbell: 1 } });
    expect(nextLoad(100, 'upperBarbell', bench, gym)).toBe(105);
  });
});

describe('N2: no makeable weight is skipped', () => {
  const gym = gymWith({ plates: stock(25, 20, 15, 10) });
  test('25/20/15/10: 50 and 70 are kept (bar + 15 or 25 a side)', () => {
    expect(gymRound(gym, 50, 'barbell')).toBe(50);
    expect(gymRound(gym, 70, 'barbell')).toBe(70);
    expect(gymIncrement(gym, 'barbell')).toBe(10);
  });

  test('progression takes the next weight the plates make', () => {
    // 15 reps: past the "big jump, build reps first" point, so the load moves.
    expect(prescribe(gym, [session('bb-bench', 50, 15, daysAgo(3))]).weight).toBe(60);
    expect(nextLoad(50, 'upperBarbell', bench, gym)).toBe(60);
    expect(nextLoad(40, 'upperBarbell', bench, gym)).toBe(50);
  });

  test('lb 45/35/25/10, no 5s: 95 and 115 are kept, and the step is 10 lb', () => {
    const lbGym = gymWith({ usesPounds: true, plates: stock(45, 35, 25, 10) });
    const lb = (n: number) => n / POUNDS_PER_KG;
    expect(gymRound(lbGym, lb(95), 'barbell') * POUNDS_PER_KG).toBeCloseTo(95);
    expect(gymRound(lbGym, lb(115), 'barbell') * POUNDS_PER_KG).toBeCloseTo(115);
    expect(gymIncrement(lbGym, 'barbell')).toBe(10);
  });
});

describe('N3: at the top of the plates, the advice is honest', () => {
  const gym = gymWith({ plates: stock([20, 2], [5, 1], [2.5, 1]) });
  test('115 is the most these plates load', () => {
    expect(gymRound(gym, 200, 'barbell')).toBe(115);
    expect(gymRoundUp(gym, 115.01, 'barbell')).toBeUndefined();
  });

  for (const last of [115, 117.5]) {
    test(`generator, last ${last}: stays at 115 and says to add reps`, () => {
      const r = prescribe(gym, [session('bb-bench', last, 12, daysAgo(3))]);
      expect(r.weight).toBe(115);
      expect(r.reasons).not.toContain('adding weight');
      expect(r.reasons).toContain('Top of your plates: add reps');
      expect(r.reps).toBeGreaterThan(12);
    });

    test(`program, last ${last}: no "+0 kg" or "+-2.5 kg"`, () => {
      const program = Programs.pplul8;
      const p = resolveSession(program, 'push', 2)!.exercises.find((x) => x.slot.id === 'push.1')!;
      const record: WorkoutRecord = {
        date: daysAgo(7),
        exercises: [{ exerciseID: 'bb-bench', sets: sets(last, p.reps.upper), slotID: 'push.1', repRange: p.reps,
          targetReps: p.reps.lower, targetRIR: effortRIR(p.effort)?.low ?? null }],
        program: { programID: program.id, week: 1, dayID: 'push', isDeload: false },
      };
      expect(nextLoad(last, 'upperBarbell', bench, gym)).toBeUndefined();
      const s = suggest(p, { history: [record], gym, now });
      expect(s.weight).toBe(115);
      expect(s.reason).not.toMatch(/\+/);
      expect(s.reason).toContain('Top of your plates');
    });
  }
});

describe('N4: a dip belt hangs single plates', () => {
  const gym = gymWith({ plates: stock(20, 10) });
  test('10 and 30 stay 10 and 30', () => {
    expect(plateSides(dip)).toBe(1);
    expect(gymRound(gym, 10, 'plates', plateSides(dip))).toBe(10);
    expect(gymRound(gym, 30, 'plates', plateSides(dip))).toBe(30);
    expect(gymIncrement(gym, 'plates')).toBe(10);
  });

  test('the planner rounds and steps dips by one plate, and the lightest is one plate', () => {
    expect(prescribe(gym, [session('weighted-dip', 10, 8, daysAgo(3))], dip).weight).toBe(10);
    expect(prescribe(gym, [session('weighted-dip', 10, 15, daysAgo(3))], dip).weight).toBe(20);
    const planner = new Planner({ plan, gym, history: [] });
    expect(planner.round(0, dip)).toBe(10);
    expect(planner.round(30, dip)).toBe(30);
    // A deload from 11.9 kg isn't 30.
    expect(planner.lighter(11.9, dip)).toBe(10);
  });

  test('a hack squat (also plate-loaded) still loads in pairs', () => {
    const hack = Catalog.exercise('hack-squat');
    expect(plateSides(hack)).toBe(2);
    expect(gymRound(gym, 35, 'plates', plateSides(hack))).toBe(40);
    expect(gymRound(gym, 10, 'plates', plateSides(hack))).toBe(0);
  });
});

describe('N6: program deloads are no basis for progression', () => {
  test('a program deload at 60 × 6 after 100 × 8 twice: the generator stays near 100', () => {
    const gym = gymWith();
    const history = [
      session('bb-bench', 60, 6, daysAgo(1), { program: { programID: 'pplul8', week: 8, dayID: 'push', isDeload: true } }),
      session('bb-bench', 100, 8, daysAgo(4)),
      session('bb-bench', 100, 8, daysAgo(7)),
    ];
    const r = prescribe(gym, history);
    expect(r.weight).toBeGreaterThanOrEqual(100);
  });
});

describe('N7: a deload is lighter even with sparse plates', () => {
  test('20 × 1 pair and 1.25 × 1 pair: lighter(60) is under 60', () => {
    const gym = gymWith({ plates: stock([20, 1], [1.25, 1]) });
    const planner = new Planner({ plan, gym, history: [] });
    expect(planner.lighter(60, bench)).toBeLessThan(60);
  });
});

describe('N5, N10, N16: blocks', () => {
  const lift = (id: string, weight: number, reps: number): LoggedExercise =>
    ({ exerciseID: id, sets: sets(weight, reps), targetReps: reps, targetRIR: 2 });
  const every2Days = (from: number, to: number, ex: (d: number) => LoggedExercise[] = () => [lift('bb-bench', 80, 8)]) => {
    const out: WorkoutRecord[] = [];
    for (let d = from; d <= to; d += 2) out.push({ date: day(d), focus: 'push', exercises: ex(d) });
    return out;
  };
  const good = (answeredAt: number): BlockCheckIn =>
    ({ jointPain: false, stillSore: false, poorSleepOrMotivation: false, stalled: false, answeredAt });

  test('N5: deleting the block\'s first workout keeps the extension and the answered check-in', () => {
    const h = every2Days(0, 36);
    const start = blockStatus(h, day(1)).startedAt;
    const c: BlockCheckIns = { [String(start)]: { 5: good(blockWeekStart(start, 5) + DAY_MS) } };
    const before = blockStatus(h, day(37), c);
    expect(before).toMatchObject({ week: 6, weeks: 7, isDeload: false });
    expect(blockCheckInDue(before, c)).toBe(6);

    const deleted = h.slice(1);
    const after = blockStatus(deleted, day(37), c);
    expect(after.startedAt).not.toBe(start);
    expect(after).toMatchObject({ week: 6, weeks: 7, isDeload: false, checkInNote: "Extended: you're recovering well" });
    expect(blockCheckInDue(after, c)).toBe(6);
    // And once week 6 is answered under the moved start, both answers apply.
    const both: BlockCheckIns = { ...c, [String(after.startedAt)]: { 6: good(day(37)) } };
    expect(blockCheckInDue(blockStatus(deleted, day(37), both), both)).toBeUndefined();
    expect(blockStatus(deleted, day(37), both).weeks).toBe(8);
  });

  test('N5: importing an older workout a few days before keeps the answers', () => {
    const h = every2Days(0, 36);
    const start = blockStatus(h, day(1)).startedAt;
    const c: BlockCheckIns = { [String(start)]: { 5: good(blockWeekStart(start, 5) + DAY_MS) } };
    const imported = [{ date: day(-4), focus: 'push' as const, exercises: [lift('bb-bench', 80, 8)] }, ...h];
    const s = blockStatus(imported, day(37), c);
    expect(s.number).toBe(1);
    expect(s.weeks).toBe(7);
  });

  test('N10: an extended block that deloads on falling maxes says so, not "Extended"', () => {
    // Bench and squat fall through week 5 (2 lifts), after a good week 5 check-in.
    const weight = (d: number) => (d < 30 ? 100 : 100 - (d - 28) * 4);
    const h = every2Days(0, 50, (d) => [lift('bb-bench', weight(d), 8), lift('bb-squat', weight(d) + 40, 8)]);
    const start = blockStatus(h, day(1)).startedAt;
    const c: BlockCheckIns = { [String(start)]: { 5: good(blockWeekStart(start, 5) + DAY_MS) } };
    const s = blockStatus(h, day(36), c);
    expect(s.isDeload).toBe(true);
    expect(s.earlyReason).toMatch(/Estimated maxes dropped/);
    expect(s.checkInNote).toBeUndefined();
  });

  test('N16: prescribe on a long history is quick (the block walk is cached)', () => {
    const ids = ['bb-bench', 'bb-squat', 'bb-row', 'bb-ohp', 'bb-deadlift'].filter((id) => Catalog.byID.has(id));
    const history: WorkoutRecord[] = Array.from({ length: 3000 }, (_, i) => ({
      date: now - (3000 - i) * DAY_MS, focus: 'push', exercises: ids.map((id) => lift(id, 60 + (i % 7), 8)),
    }));
    const planner = new Planner({ plan, gym: gymWith(), history });
    planner.prescribe(bench, now);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) planner.prescribe(bench, now);
    expect((performance.now() - t0) / 20).toBeLessThan(8);
  });
});

describe('N14, N15: reading gyms', () => {
  test('N14: a pair count of 0 or 0.5 drops that size instead of reading as unlimited', () => {
    const g = readGym({ id: 'g', name: 'G', equipment: ['barbell'], usesPounds: false, increments: {},
      plates: [{ weight: 20, pairs: 0 }, { weight: 10, pairs: 0.5 }, { weight: 5, pairs: 2.7 }, { weight: 2.5 }, { weight: 1.25, pairs: 'x' }] })!;
    expect(g.plates).toEqual([{ weight: 5, pairs: 2 }, { weight: 2.5 }, { weight: 1.25 }]);
  });

  test('N15: a Smith machine start of 0 is kept', () => {
    const g = readGym({ id: 'g', name: 'G', equipment: ['smithMachine'], usesPounds: false, increments: {}, bars: { smithMachine: 0, barbell: 0 } })!;
    expect(g.bars).toEqual({ smithMachine: 0 });
  });
});

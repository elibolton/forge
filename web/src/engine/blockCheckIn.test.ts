import { describe, expect, test } from 'vitest';
import {
  type BlockCheckIn, type BlockCheckIns, DAY_MS, Gyms, type LoggedExercise, Planner, type WorkoutRecord, blockCheckInDue, blockStatus,
  blockWeekStart, decideBlock, defaultPlan, deloadDates, readBlockCheckIns,
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

const good = (answeredAt: number, extra: Partial<BlockCheckIn> = {}): BlockCheckIn =>
  ({ jointPain: false, stillSore: false, poorSleepOrMotivation: false, stalled: false, answeredAt, ...extra });

const h = every2Days(0, 80);
const start = blockStatus(h, day(1)).startedAt;
const weekStart = (w: number) => blockWeekStart(start, w);
/** Answers for block 1, by week. */
const answers = (byWeek: Record<number, BlockCheckIn>): BlockCheckIns => ({ [String(start)]: byWeek });

describe('decideBlock', () => {
  test('no answers, or skipped, keeps the plan', () => {
    expect(decideBlock(undefined, 0, 5)).toEqual({ action: 'keep' });
    expect(decideBlock(good(0, { skipped: true }), 0, 5)).toEqual({ action: 'keep' });
  });

  test('all good and nothing falling extends a week', () => {
    expect(decideBlock(good(0), 0, 5)).toEqual({ action: 'extend', reason: "Extended: you're recovering well" });
    expect(decideBlock(good(0), 0, 6).action).toBe('extend');
  });

  test('never past 7 loading weeks', () => {
    expect(decideBlock(good(0), 0, 7)).toEqual({ action: 'keep' });
  });

  test('a falling lift blocks the extension', () => {
    expect(decideBlock(good(0), 1, 5)).toEqual({ action: 'keep' });
  });

  test('joint pain alone deloads', () => {
    expect(decideBlock(good(0, { jointPain: true }), 0, 5)).toEqual({ action: 'deload', reason: 'Deload early: joints flagged', flagged: 'joints' });
  });

  test('one poor answer keeps the plan', () => {
    for (const k of ['stillSore', 'poorSleepOrMotivation', 'stalled'] as const) expect(decideBlock(good(0, { [k]: true }), 0, 5).action).toBe('keep');
  });

  test('two poor signals deload, counting a falling lift as one', () => {
    expect(decideBlock(good(0, { stillSore: true, stalled: true }), 0, 5)).toMatchObject({ action: 'deload', reason: 'Deload early: soreness and stalled lifts flagged' });
    expect(decideBlock(good(0, { poorSleepOrMotivation: true }), 1, 6)).toMatchObject({ action: 'deload', flagged: 'low energy and falling maxes' });
    expect(decideBlock(good(0, { stillSore: true, poorSleepOrMotivation: true, stalled: true }), 0, 7).reason).toBe('Deload early: soreness, low energy and stalled lifts flagged');
  });
});

describe('Blocks with check-ins', () => {
  test('without answers nothing changes', () => {
    for (let d = 0; d <= 80; d += 3) {
      const base = blockStatus(h, day(d));
      expect(blockStatus(h, day(d), {})).toEqual(base);
      expect(blockStatus(h, day(d), answers({ 5: good(weekStart(5), { skipped: true }) }))).toEqual(base);
      expect(base.checkInNote).toBeUndefined();
      expect(base.extendedBy).toBeUndefined();
    }
    expect(blockStatus(h, day(36))).toMatchObject({ week: 6, weeks: 6, isDeload: true });
    expect(deloadDates(h, {})).toEqual(deloadDates(h));
  });

  test('the check-in is due in week 5, and again in each added week', () => {
    expect(blockCheckInDue(blockStatus(h, day(22)), {})).toBeUndefined();
    expect(blockCheckInDue(blockStatus(h, day(29)), {})).toBe(5);
    expect(blockCheckInDue(blockStatus(h, day(36)), {})).toBeUndefined(); // the deload
    const one = answers({ 5: good(weekStart(5)) });
    expect(blockCheckInDue(blockStatus(h, day(29), one), one)).toBeUndefined();
    expect(blockCheckInDue(blockStatus(h, day(36), one), one)).toBe(6);
    const two = answers({ 5: good(weekStart(5)), 6: good(weekStart(6)) });
    expect(blockCheckInDue(blockStatus(h, day(43), two), two)).toBe(7);
  });

  test('good answers stretch the block a week at a time, up to 7 loading weeks', () => {
    const one = answers({ 5: good(weekStart(5)) });
    expect(blockStatus(h, day(36), one)).toMatchObject({ week: 6, weeks: 7, isDeload: false, extendedBy: 1, checkInNote: "Extended: you're recovering well" });
    expect(blockStatus(h, day(43), one)).toMatchObject({ week: 7, weeks: 7, isDeload: true });
    expect(blockStatus(h, day(50), one)).toMatchObject({ number: 2, week: 1 });

    const all = answers({ 5: good(weekStart(5)), 6: good(weekStart(6)), 7: good(weekStart(7)) });
    expect(blockStatus(h, day(43), all)).toMatchObject({ week: 7, weeks: 8, isDeload: false, extendedBy: 2 });
    expect(blockStatus(h, day(50), all)).toMatchObject({ week: 8, weeks: 8, isDeload: true });
    expect(blockStatus(h, day(57), all)).toMatchObject({ number: 2, week: 1 });
  });

  test('joint pain before training that week makes it the deload', () => {
    const c = answers({ 5: good(weekStart(5), { jointPain: true }) });
    const b = blockStatus(h, day(29), c);
    expect(b).toMatchObject({ week: 5, weeks: 5, isDeload: true, checkInNote: 'Deload early: joints flagged' });
    expect(b.earlyReason).toBe('Your check-in flagged joints');
    expect(blockStatus(h, day(36), c)).toMatchObject({ number: 2, week: 1 });
  });

  test('a deload chosen after training that week follows it, as planned', () => {
    const c = answers({ 5: good(day(31), { stillSore: true, stalled: true }) });
    expect(blockStatus(h, day(31), c)).toEqual(blockStatus(h, day(31)));
    expect(blockStatus(h, day(36), c).isDeload).toBe(true);
  });

  test('an extended block can still deload early in week 6', () => {
    const c = answers({ 5: good(weekStart(5)), 6: good(weekStart(6), { jointPain: true }) });
    expect(blockStatus(h, day(37), c)).toMatchObject({ week: 6, weeks: 6, isDeload: true, checkInNote: 'Deload early: joints flagged' });
    expect(blockStatus(h, day(37), c).extendedBy).toBeUndefined();
  });

  test('falling maxes on 2 lifts still bring the deload forward, whatever the answers', () => {
    const falling = every2Days(0, 27, (d) => [lift('bb-bench', d < 21 ? 80 : 80 - (d - 20) * 2, 8), lift('bb-squat', d < 21 ? 100 : 100 - (d - 20) * 2, 8)]);
    const s = blockStatus(falling, day(1)).startedAt;
    const c: BlockCheckIns = { [String(s)]: { 5: good(blockWeekStart(s, 5)) } };
    expect(blockStatus(falling, day(29), c)).toMatchObject({ week: 5, isDeload: true });
    expect(blockStatus(falling, day(29), c).earlyReason).toMatch(/Estimated maxes/);
  });

  test('answers for another block are ignored', () => {
    // The block before this one: six weeks away, far past the drift a moved start is allowed.
    const c: BlockCheckIns = { [String(start - 42 * DAY_MS)]: { 5: good(weekStart(5)) } };
    expect(blockStatus(h, day(36), c)).toEqual(blockStatus(h, day(36)));
  });

  test('deloadDates matches blockStatus with check-ins', () => {
    for (const c of [
      answers({ 5: good(weekStart(5)) }),
      answers({ 5: good(weekStart(5)), 6: good(weekStart(6)), 7: good(weekStart(7)) }),
      answers({ 5: good(weekStart(5), { jointPain: true }) }),
    ]) {
      const dates = deloadDates(h, c);
      for (const r of h) expect(dates.has(r.date)).toBe(blockStatus(h, r.date, c).isDeload);
    }
  });

  test('generated workouts follow the extended block', () => {
    const past = h.filter((r) => r.date < day(36));
    const make = (checkIns?: BlockCheckIns) => new Planner({ plan: defaultPlan({ sessionMinutes: 60 }), gym: Gyms.commercial(), history: past, checkIns });
    expect(make().generate({ now: day(36), seed: 1, focus: 'push' }).block?.isDeload).toBe(true);
    const w = make(answers({ 5: good(weekStart(5)) })).generate({ now: day(36), seed: 1, focus: 'push' });
    expect(w.block).toMatchObject({ week: 6, weeks: 7, isDeload: false });
    expect(w.note ?? '').not.toMatch(/Deload week/);
  });
});

describe('Reading stored check-ins', () => {
  test('anything unreadable is dropped', () => {
    for (const bad of [null, undefined, 'x', 3, [], [good(1)]]) expect(readBlockCheckIns(bad)).toEqual({});
    const read = readBlockCheckIns({
      abc: { 5: good(1) },
      '': { 5: good(1) },
      [String(start)]: {
        4: good(1), 8: good(1), x: good(1), 5.5: good(1),
        6: { jointPain: 'yes', stillSore: 1, stalled: true, answeredAt: 7, skipped: 'true' },
        7: { jointPain: true },
        5: 'nope',
      },
      '123': { 5: { answeredAt: Number.NaN } },
    });
    expect(read).toEqual({ [String(start)]: { 6: { jointPain: false, stillSore: false, poorSleepOrMotivation: false, stalled: true, answeredAt: 7 } } });
  });

  test('a good answer reads back unchanged', () => {
    const c = answers({ 5: good(weekStart(5), { stalled: true }), 6: good(9, { skipped: true }) });
    expect(readBlockCheckIns(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });
});

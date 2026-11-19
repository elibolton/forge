import { describe, expect, test } from 'vitest';
import {
  DAY_MS, Gyms, type LoggedExercise, POUNDS_PER_KG, Programs, type WorkoutRecord, completeDay, checkInDue, deloadNow,
  dayOrder, newProgress, nextDayID, nextSession, programDay, readProgress, readRecord, repRange, repsDropped,
  repsDroppedFlag, resolveSession, restText, rirTarget, scheduledOn, setsText, suggest, suggestsDeload, skipDay,
  Catalog, isPerSide, effortRIR, type ProgramProgress, straightSets, workingSets, readSet, jumpToWeek,
} from './index';

const now = 1_800_000_000_000;
const daysAgo = (d: number) => now - d * DAY_MS;
const program = Programs.pplul8;
const gym = Gyms.homeBarbell();

function rx(slot: string, week: number, adjustments: Record<string, number> = {}) {
  return resolveSession(program, slot.split('.')[0], week, adjustments)!.exercises.find((e) => e.slot.id === slot)!;
}

function logged(slot: string, week: number, weight: number, reps: number[], date: number, rir: number | null = null): WorkoutRecord {
  const p = rx(slot, week);
  return {
    date,
    exercises: [{ exerciseID: p.slot.exerciseID, sets: reps.map((r) => ({ weight, reps: r, rir, isWarmup: false })),
      targetReps: p.reps.lower, slotID: slot, repRange: p.reps, targetRIR: effortRIR(p.effort)?.low ?? null }],
    program: { programID: program.id, week, dayID: slot.split('.')[0], isDeload: p.isDeload },
  };
}

const rirE = (a: number, b?: number) => ({ type: 'rir', rir: rirTarget(a, b) });

describe('Program integrity', () => {
  test('every program is well formed', () => {
    for (const p of Programs.all) {
      expect(p.schedule.length).toBe(7);
      expect(p.weekRules.length).toBe(p.weeks);
      expect(new Set(dayOrder(p))).toEqual(new Set(p.days.map((d) => d.id)));
      for (const day of p.days) {
        for (const slot of day.exercises) expect(Catalog.builtIn.some((e) => e.id === slot.exerciseID), slot.exerciseID).toBe(true);
        const groups: Record<string, number> = {};
        for (const s of day.exercises) if (s.supersetGroup) groups[s.supersetGroup] = (groups[s.supersetGroup] ?? 0) + 1;
        expect(Object.values(groups).every((n) => n === 2)).toBe(true);
        expect(new Set(Object.keys(groups))).toEqual(new Set(day.supersets.map((s) => s.group)));
      }
      const ids = p.days.flatMap((d) => d.exercises.map((e) => e.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test('schedule has rest days', () => {
    expect(dayOrder(program)).toEqual(['push', 'pull', 'legs', 'upper', 'lower']);
    const monday = new Date(Date.UTC(2026, 10, 2, 12));
    const plus = (d: number) => new Date(monday.getTime() + d * DAY_MS);
    expect(scheduledOn(program, monday, true)).toBe('push');
    expect(scheduledOn(program, plus(3), true)).toBeNull();
    expect(scheduledOn(program, plus(6), true)).toBeNull();
    expect(scheduledOn(program, plus(5), true)).toBe('lower');
  });
});

describe('Resolver', () => {
  test('week one is easy and calibrates', () => {
    expect(rx('push.1', 1).effort).toEqual(rirE(3));
    expect(rx('push.3', 1).effort).toEqual(rirE(2));
    const push = resolveSession(program, 'push', 1)!;
    expect(push.exercises.filter((e) => e.lastSetNote?.includes('Calibration')).map((e) => e.slot.id)).toEqual(['push.5']);
    const nordic = rx('legs.3', 1);
    expect(nordic.sets).toBe(2);
    expect(nordic.reps).toEqual(repRange(3, 5));
    expect(nordic.effort.type).toBe('eccentricOnly');
  });
  test('middle weeks use base RIR', () => {
    expect(rx('push.1', 3).effort).toEqual(rirE(1, 2));
    expect(rx('legs.1', 4).effort).toEqual(rirE(2));
    expect(rx('push.3', 3).effort).toEqual(rirE(0, 1));
    expect(rx('push.3', 3).lastSetNote).toBe('Lengthened partials on the last set');
  });
  test('late weeks push harder except squat and RDL', () => {
    for (const w of [5, 6, 7]) {
      expect(rx('push.1', w).effort).toEqual(rirE(1));
      expect(rx('legs.1', w).effort).toEqual(rirE(1, 2));
      expect(rx('lower.1', w).effort).toEqual(rirE(1, 2));
      expect(rx('push.3', w).effort).toEqual(rirE(0));
      expect(rx('push.3', w).lastSetNote).toContain('partials');
      expect(rx('legs.3', w).effort.type).toBe('eccentricOnly');
    }
  });
  test('deload halves sets and drops notes', () => {
    expect(rx('push.1', 8).sets).toBe(2);
    expect(rx('pull.1', 8).sets).toBe(2);
    expect(rx('push.4', 8).sets).toBe(3);
    expect(rx('push.3', 8).sets).toBe(1);
    expect(rx('legs.3', 8).sets).toBe(1);
    expect(rx('legs.3', 8).reps).toEqual(repRange(3, 3));
    expect(resolveSession(program, 'upper', 8)!.exercises.every((e) => e.lastSetNote === undefined && e.isDeload)).toBe(true);
    expect(rx('push.1', 8).effort).toEqual(rirE(3, 4));
  });
  test('superset rests', () => {
    expect(rx('upper.6a', 2).restSeconds).toBe(90);
    expect(rx('upper.6a', 2).supersetRestBetween).toBe(90);
    expect(rx('upper.6b', 2).restSeconds).toBe(120);
  });
  test('rest text', () => {
    expect(restText(rx('push.1', 1))).toBe('3–4 min');
    expect(restText(rx('push.2', 1))).toBe('2.5–3 min');
    expect(restText(rx('push.5', 1))).toBe('90 s–2 min');
    expect(restText(rx('push.4', 1))).toBe('~60–90 s, alternating sides');
    expect(restText(rx('legs.2', 1))).toBe('60 s between sides · 2 min between rounds');
  });
  test('per side and optional', () => {
    expect(rx('legs.2', 2).slot.laterality).toBe('perLeg');
    expect(setsText(rx('legs.2', 2))).toBe('3 × 8–12 per leg');
    expect(rx('pull.6', 2).slot.isOptional).toBe(true);
  });
  test('set adjustments apply but not in deload', () => {
    expect(rx('pull.3', 3, { 'pull.3': -1 }).sets).toBe(2);
    expect(rx('pull.3', 8, { 'pull.3': -1 }).sets).toBe(2);
  });
});

describe('Progress', () => {
  test('advances by sessions, not calendar', () => {
    const p = newProgress(program.id);
    expect(nextDayID(p, program)).toBe('push');
    completeDay(p, 'push', 1, program);
    expect(nextDayID(p, program)).toBe('pull');
    skipDay(p, 'pull', program);
    for (const d of ['legs', 'upper']) completeDay(p, d, 1, program);
    expect(p.week).toBe(1);
    completeDay(p, 'lower', 1, program);
    expect(p.week).toBe(2);
    expect(nextDayID(p, program)).toBe('push');
    expect(checkInDue(p, program)).toBe(1);
  });
  test('early deload jumps to deload then finishes', () => {
    const p = newProgress(program.id, now, 3);
    p.deloadNext = true;
    for (const d of dayOrder(program)) completeDay(p, d, 3, program);
    expect(p.week).toBe(8);
    expect(checkInDue(p, program)).toBeUndefined();
    for (const d of dayOrder(program)) completeDay(p, d, 8, program);
    expect(p.isFinished).toBe(true);
    expect(nextDayID(p, program)).toBeUndefined();
    const q = newProgress(program.id, now, 2);
    deloadNow(q, program);
    expect(q.week).toBe(8);
    expect(nextDayID(q, program)).toBe('push');
  });
  test('progress decodes partial data', () => {
    const p = readProgress(JSON.parse('{"programID":"pplul-8wk-home","week":3,"completed":{"3":["push"]},"future":true}'))!;
    expect(p.week).toBe(3);
    expect(p.completed[3]).toEqual(['push']);
    expect(p.setAdjustments).toEqual({});
    expect(p.isFinished).toBe(false);
    expect(readProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});

describe('Progression', () => {
  test('first session starts at bottom of range', () => {
    const s = suggest(rx('push.1', 1), { history: [], gym, now });
    expect(s.reps).toBe(5);
    expect(s.weight ?? 0).toBeGreaterThanOrEqual(20);
    expect(s.reason).toContain('5 reps with 3 reps left');
  });
  test('adds reps before load', () => {
    const s = suggest(rx('push.1', 2), { history: [logged('push.1', 1, 80, [8, 7, 6], daysAgo(7))], gym, now });
    expect(s.weight).toBe(80);
    expect(s.reps).toBe(7);
    expect(s.reason).toContain('Add reps');
  });
  test('adds load when every set hits the top', () => {
    expect(suggest(rx('push.1', 2), { history: [logged('push.1', 1, 80, [8, 8, 8], daysAgo(7))], gym, now }))
      .toMatchObject({ weight: 82.5, reps: 5 });
    expect(suggest(rx('legs.1', 2), { history: [logged('legs.1', 1, 100, [8, 8, 8, 8], daysAgo(7))], gym, now }).weight).toBe(105);
    expect(suggest(rx('pull.1', 2), { history: [logged('pull.1', 1, 60, [10, 10, 10, 10], daysAgo(7))], gym, now }).weight).toBe(65);
    const lb = { ...gym, usesPounds: true };
    const s = suggest(rx('legs.1', 2), { history: [logged('legs.1', 1, 225 / POUNDS_PER_KG, [8, 8, 8, 8], daysAgo(7))], gym: lb, now });
    expect(Math.abs(s.weight! * POUNDS_PER_KG - 235)).toBeLessThan(0.01);
  });
  test('a lighter drop set after the top sets does not hold progression back', () => {
    const r = logged('push.1', 1, 80, [8, 8, 8], daysAgo(7));
    r.exercises[0].sets.push({ weight: 60, reps: 5, rir: 0, isWarmup: false, type: 'drop' });
    expect(suggest(rx('push.1', 2), { history: [r], gym, now })).toMatchObject({ weight: 82.5, reps: 5 });
    expect(straightSets(r.exercises[0]).length).toBe(3);
    expect(workingSets(r.exercises[0]).length).toBe(4); // volume and recovery still count it
  });
  test('set types survive saving and loading; unknown ones are dropped', () => {
    expect(readSet({ weight: 60, reps: 5, isWarmup: false, type: 'drop' })?.type).toBe('drop');
    expect(readSet({ weight: 60, reps: 5, isWarmup: false, type: 'failure' })?.type).toBe('failure');
    expect(readSet({ weight: 60, reps: 5, isWarmup: false, type: 'giant' })?.type).toBeUndefined();
  });
  test('one short set means no load yet', () => {
    expect(suggest(rx('push.1', 2), { history: [logged('push.1', 1, 80, [8, 8, 7], daysAgo(7))], gym, now }).weight).toBe(80);
  });
  test('big jump extends the range first', () => {
    const s = suggest(rx('upper.5', 3), { history: [logged('upper.5', 2, 8, Array(10).fill(20), daysAgo(7))], gym, now });
    expect(s.action).toEqual({ type: 'extendRange', by: 4 });
    expect(s.weight).toBe(8);
    expect(s.range).toEqual(repRange(12, 24));
    const progress = newProgress(program.id, now, 4);
    progress.rangeExtensions['upper.5'] = 4;
    const s2 = suggest(rx('upper.5', 4), { progress, history: [logged('upper.5', 3, 8, Array(10).fill(24), daysAgo(7))], gym, now });
    expect(s2.weight).toBe(10);
    expect(s2.action).toEqual({ type: 'resetRange' });
    expect(s2.range).toEqual(repRange(12, 20));
  });
  test('stall suggests dropping a set', () => {
    const h = [
      logged('pull.3', 3, 50, [11, 10, 10], daysAgo(7)),
      logged('pull.3', 2, 50, [11, 10, 10], daysAgo(14)),
      logged('pull.3', 1, 50, [11, 11, 10], daysAgo(21)),
    ];
    expect(suggest(rx('pull.3', 4), { history: h, gym, now }).action).toEqual({ type: 'dropSet' });
    const progress = newProgress(program.id, now, 4);
    progress.setAdjustments['pull.3'] = -1;
    expect(suggest(rx('pull.3', 4), { progress, history: h, gym, now }).action).toBeUndefined();
  });
  test('deload keeps load and skips progression', () => {
    const s = suggest(rx('push.1', 8), { history: [logged('push.1', 7, 90, [8, 8, 8], daysAgo(7))], gym, now });
    expect(s.weight).toBe(90);
    expect(s.action).toBeUndefined();
    expect(s.reason).toContain('Deload');
  });
  test('nordics progress by reps', () => {
    const s0 = suggest(rx('legs.3', 1), { history: [], gym, now });
    expect(s0.weight).toBeNull();
    expect(s0.reps).toBe(3);
    const s = suggest(rx('legs.3', 3), { history: [logged('legs.3', 2, 0, [5, 4, 4], daysAgo(7))], gym, now });
    expect(s.weight).toBeNull();
    expect(s.reps).toBe(5);
  });
});

describe('Fatigue', () => {
  test('reps dropping on two exercises flags', () => {
    const h = [
      logged('push.1', 3, 80, [7, 6, 6], daysAgo(2)),
      logged('push.2', 3, 30, [9, 8, 8], daysAgo(2)),
      logged('push.1', 2, 80, [8, 7, 7], daysAgo(9)),
      logged('push.2', 2, 30, [10, 9, 9], daysAgo(9)),
    ];
    expect(repsDropped(h, program.id, 3)).toEqual(['push.1', 'push.2']);
    expect(repsDroppedFlag(h, program.id, 3)).toBe(true);
    expect(repsDroppedFlag(h.slice(1), program.id, 3)).toBe(false);
    expect(suggestsDeload({ jointPain: true, stillSore: false, poorSleepOrMotivation: false, repsDropped: true })).toBe(true);
    expect(suggestsDeload({ jointPain: false, stillSore: true, poorSleepOrMotivation: false, repsDropped: false })).toBe(false);
  });
});

describe('Storage', () => {
  test('logged program fields round trip and old data loads', () => {
    const record = logged('legs.2', 2, 20, [10, 10], now);
    record.exercises[0].sets[0].side = 'left';
    const back = readRecord(JSON.parse(JSON.stringify(record)))!;
    expect(back.program).toEqual(record.program);
    expect(back.exercises[0].slotID).toBe('legs.2');
    expect(back.exercises[0].repRange).toEqual(repRange(8, 12));
    expect(back.exercises[0].sets[0].side).toBe('left');
    const old = readRecord(JSON.parse('{"date":0,"exercises":[{"exerciseID":"bb-bench","sets":[{"weight":80,"reps":5}],"targetReps":5}]}'))!;
    expect(old.program).toBeNull();
    expect(old.exercises[0].slotID).toBeNull();
    expect(old.exercises[0].sets[0].side).toBeNull();
  });
});

describe('Simulation', () => {
  test('follow Program 1 for 8 weeks, logging the suggestion plus one rep', () => {
    const progress: ProgramProgress = newProgress(program.id, daysAgo(60));
    const history: WorkoutRecord[] = [];
    const bench: number[] = [];
    const weekly: Record<number, number> = {};
    let day = 60;
    for (let session = nextSession(progress, program); session; session = nextSession(progress, program)) {
      const date = daysAgo(day); day -= 1.4;
      expect(session.exercises.length).toBeGreaterThan(0);
      const out: LoggedExercise[] = [];
      for (const p of session.exercises) {
        const s = suggest(p, { progress, history, gym, now: date });
        if (s.action?.type === 'extendRange') progress.rangeExtensions[p.slot.id] = s.action.by;
        if (s.action?.type === 'resetRange') delete progress.rangeExtensions[p.slot.id];
        const reps = Math.min(s.range.upper, s.reps + 1);
        const count = p.sets * (isPerSide(p.slot.laterality) ? 2 : 1);
        out.push({ exerciseID: p.slot.exerciseID, sets: Array.from({ length: count }, () => ({ weight: s.weight ?? 0, reps, rir: effortRIR(p.effort)?.low ?? null, isWarmup: false })),
          targetReps: s.reps, slotID: p.slot.id, repRange: s.range, targetRIR: effortRIR(p.effort)?.low ?? null });
        if (p.slot.id === 'push.1') bench.push(s.weight ?? 0);
        weekly[session.week] = (weekly[session.week] ?? 0) + p.sets;
      }
      history.push({ date, focus: session.day.focus, exercises: out,
        program: { programID: program.id, week: session.week, dayID: session.day.id, isDeload: session.rule.isDeload } });
      completeDay(progress, session.day.id, session.week, program);
      expect(history.length).toBeLessThanOrEqual(40);
    }
    expect(progress.isFinished).toBe(true);
    expect(history.length).toBe(40);
    expect(bench.length).toBe(8);
    expect(bench[6]).toBeGreaterThan(bench[0]);
    expect(weekly[8]).toBeLessThan(Math.floor(weekly[7] * 2 / 3));
    expect(programDay(program, 'push')).toBeDefined();
  });
});

// Bug hunt P1: jumping back to a week that was already done left no next day and no way forward.
describe('Jump to Week', () => {
  const finishWeek = (p: ProgramProgress, week: number) => { for (const d of dayOrder(program)) completeDay(p, d, week, program); };

  test('jumping back to a finished week starts it over', () => {
    const p = newProgress(program.id, now, 1);
    finishWeek(p, 1);
    finishWeek(p, 2);
    expect(p.week).toBe(3);
    jumpToWeek(p, 1, program);
    expect(p.week).toBe(1);
    expect(nextDayID(p, program)).toBe(dayOrder(program)[0]);
    // Weeks after the jump are cleared too, so finishing week 1 lands on a week with a session.
    finishWeek(p, 1);
    expect(p.week).toBe(2);
    expect(nextDayID(p, program)).toBe(dayOrder(program)[0]);
    skipDay(p, dayOrder(program)[0], program);
    expect(p.skipped[2]).toEqual([dayOrder(program)[0]]);
  });

  test('jumping out of a finished program reopens it', () => {
    const p = newProgress(program.id, now, program.weeks);
    finishWeek(p, program.weeks);
    expect(p.isFinished).toBe(true);
    jumpToWeek(p, program.weeks, program);
    expect([p.isFinished, p.week, nextDayID(p, program)]).toEqual([false, program.weeks, dayOrder(program)[0]]);
  });

  test('an old stuck state (week done, not finished) moves on at the next completion or skip', () => {
    const p = newProgress(program.id, now, 1);
    finishWeek(p, 1);
    finishWeek(p, 2);
    // What the old jump did: point back at week 1 and keep its completions.
    p.week = 1;
    // Completing the day again (a repeat log) moves on past every already-done week.
    completeDay(p, dayOrder(program)[0], 2, program);
    expect(p.week).toBe(1);
    const q = structuredClone(p);
    q.completed[1] = q.completed[1].slice(1);
    completeDay(q, dayOrder(program)[0], 1, program);
    expect(q.week).toBe(3);
    expect(nextDayID(q, program)).toBe(dayOrder(program)[0]);
  });
});

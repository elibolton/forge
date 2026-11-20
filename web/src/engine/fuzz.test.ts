import { describe, expect, test } from 'vitest';
import {
  Catalog, DAY_FOCUSES, DAY_MS, EQUIPMENT, GOALS, JOINTS, LEVELS, type LoggedExercise, POUNDS_PER_KG, Planner, SPLITS, SeededRandom,
  VARIABILITIES, type WorkoutRecord, defaultPlan, gymBar, gymHas, gymRoundUp, loadEquipment, makeGym, nearestLoadable, nextLoad,
  plannedWorkingSets, plateSides,
} from './index';

/**
 * The generator's invariants over random setups (the bug hunt's fuzz run, kept small and seeded so it
 * runs in about a second): it never throws, fits the time, uses only owned equipment, never picks an
 * excluded exercise or one that stresses an injured joint, prescribes finite non-negative loads (and
 * none of 0 on loaded work), and gives every exercise at least one working set.
 */
const now = 1_800_000_000_000;
const CASES = 1200;

function setup(seed: number) {
  const rng = new SeededRandom(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng.next(0, xs.length))];
  const chance = (p: number) => rng.next(0, 1) < p;
  const equipment = EQUIPMENT.filter(() => chance(chance(0.2) ? 0.1 : 0.5));
  const pounds = chance(0.3);
  const increments = chance(0.3) ? { dumbbell: pick(pounds ? [2.5, 5, 10, 20] : [1, 2, 2.5, 5, 10]) } : {};
  const gym = makeGym('fuzz', equipment, pounds, increments, `g${seed}`);
  const loaded = Catalog.all.filter((e) => e.pattern !== 'mobility');
  const preferences = Object.fromEntries(loaded.filter(() => chance(0.05)).map((e) => [e.id, pick(['more', 'less', 'exclude'] as const)]));
  const plan = defaultPlan({
    goal: pick(GOALS), experience: pick(LEVELS), split: pick(SPLITS), sessionMinutes: pick([15, 20, 30, 45, 60, 90]),
    variability: pick(VARIABILITIES), warmUpSets: chance(0.7), supersets: chance(0.3), preferences,
    injuries: JOINTS.filter(() => chance(0.08)),
  });
  // A few weeks of plausible history on random exercises, some unrated or at odd loads.
  const history: WorkoutRecord[] = [];
  const sessions = chance(0.4) ? 0 : Math.floor(rng.next(1, 30));
  for (let i = 0; i < sessions; i++) {
    const exercises: LoggedExercise[] = Array.from({ length: 4 }, () => {
      const e = pick(loaded);
      const weight = e.starterOneRM ? pick([0, e.starterOneRM * rng.next(0.2, 1.2), e.starterOneRM * 0.6]) : 0;
      const reps = Math.floor(rng.next(1, 20));
      return { exerciseID: e.id, sets: [0, 1, 2].map(() => ({ weight, reps, rir: chance(0.5) ? null : Math.floor(rng.next(0, 4)), isWarmup: false })) };
    });
    history.push({ date: now - (i * 2 + 1) * DAY_MS - rng.next(0, DAY_MS / 2), focus: pick(DAY_FOCUSES), exercises });
  }
  const focus = chance(0.5) ? pick(DAY_FOCUSES) : null;
  return { gym, plan, history, focus, seed };
}

describe('Generator invariants (seeded fuzz)', () => {
  test(`${CASES} random setups`, () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const { gym, plan, history, focus } = setup(seed);
      const ctx = `seed ${seed}: ${plan.goal}/${plan.experience}/${plan.sessionMinutes} min/${focus ?? plan.split}`;
      const planner = new Planner({ plan, gym, history });
      const w = planner.generate({ now, seed, focus });
      expect(w.estimatedMinutes, ctx).toBeLessThanOrEqual(plan.sessionMinutes);
      const ids = w.exercises.map((p) => p.exercise.id);
      expect(new Set(ids).size, ctx).toBe(ids.length);
      for (const p of w.exercises) {
        const e = p.exercise;
        const where = `${ctx} ${e.id}`;
        expect(gymHas(gym, e), where).toBe(true);
        expect(plan.preferences[e.id], where).not.toBe('exclude');
        expect(e.jointsStressed.some((j) => plan.injuries.includes(j)), where).toBe(false);
        expect(e.pattern, where).not.toBe('mobility');
        expect(plannedWorkingSets(p).length, where).toBeGreaterThanOrEqual(1);
        for (const s of p.sets) {
          expect(Number.isFinite(s.reps) && s.reps > 0, where).toBe(true);
          if (s.weight === null) continue;
          expect(Number.isFinite(s.weight) && s.weight > 0 && s.weight <= 1000, `${where} weight ${s.weight}`).toBe(true);
        }
      }
    }
  });
});

/**
 * Plates and progression over random plate sets, many of them pair-limited (the ship audit's N1–N4 and
 * N7): every weight on a barbell, Smith machine or dip belt is one the plates make; "adding weight"
 * always means heavier than last time; at the top of the plates the advice says so instead; a deload is
 * never heavier than the last load, and lighter whenever anything lighter can be loaded.
 */
describe('Plate invariants (seeded fuzz)', () => {
  const PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5], lb: [45, 35, 25, 10, 5, 2.5, 1.25] };
  const lifts = ['bb-bench', 'bb-squat', 'bb-ohp', 'smith-bench', 'smith-squat', 'weighted-dip', 'hack-squat'].filter((id) => Catalog.byID.has(id));
  const PLATE_CASES = 1500;

  test(`${PLATE_CASES} random plate sets`, () => {
    for (let seed = 1; seed <= PLATE_CASES; seed++) {
      const rng = new SeededRandom(seed * 7919);
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng.next(0, xs.length))];
      const chance = (p: number) => rng.next(0, 1) < p;
      const pounds = chance(0.35);
      const sizes = (pounds ? PLATES.lb : PLATES.kg).filter(() => chance(0.55));
      if (!sizes.length) sizes.push(pick(pounds ? PLATES.lb : PLATES.kg));
      const limited = chance(0.6);
      const plates = sizes.map((weight) => (limited && chance(0.7) ? { weight, pairs: Math.floor(rng.next(1, 5)) } : { weight }));
      const steps = pounds ? [1, 2, 2.5, 5, 10] : [0.5, 1, 1.25, 2, 2.5, 5];
      const increments = chance(0.5) ? { barbell: pick(steps), smithMachine: pick(steps), plates: pick(steps) } : {};
      const bars = chance(0.4) ? { barbell: pick(pounds ? [35, 45] : [15, 20]), smithMachine: pick(pounds ? [0, 15, 25] : [0, 7, 10]) } : undefined;
      const equipment = ['barbell', 'smithMachine', 'flatBench', 'squatRack', 'dipStation', 'dipBelt', 'hackSquat'] as const;
      const gym = { ...makeGym('plates', [...equipment], pounds, increments, `p${seed}`), plates, ...(bars ? { bars } : {}) };
      const toGym = pounds ? POUNDS_PER_KG : 1;
      const e = Catalog.exercise(pick(lifts));
      const kind = loadEquipment(e) ?? 'plates';
      const sides = plateSides(e);
      const bar = gymBar(gym, kind);
      const plan = defaultPlan({ goal: pick(['buildMuscle', 'getStronger'] as const), experience: pick(LEVELS) });
      const planner = new Planner({ plan, gym, history: [] });
      // The last load: usually one these plates make, sometimes one logged at another gym.
      const lastLoad = chance(0.8) ? planner.round(rng.next(0, 200), e) : Math.round(rng.next(5, 200) * 4) / 4;
      const reps = Math.floor(rng.next(6, 25));
      const last: WorkoutRecord = {
        date: now - 3 * DAY_MS,
        exercises: [{ exerciseID: e.id, sets: [0, 1, 2].map(() => ({ weight: lastLoad, reps, rir: 2, isWarmup: false })), targetReps: reps, targetRIR: 2 }],
      };
      const ctx = `seed ${seed}: ${e.id} ${pounds ? 'lb' : 'kg'} plates ${JSON.stringify(plates)} steps ${JSON.stringify(increments)} bar ${bar} last ${lastLoad}x${reps}`;
      const makeable = (kg: number) => Math.abs(nearestLoadable(kg * toGym, bar, plates, sides) - kg * toGym) < 1e-6;

      const p = new Planner({ plan, gym, history: [last] }).prescribe(e, now);
      const reasons = p.reasons.join(' | ');
      for (const s of p.sets) if (s.weight !== null) expect(makeable(s.weight), `${ctx} → ${s.weight}`).toBe(true);
      const top = p.sets.filter((s) => !s.isWarmup)[0].weight!;
      if (reasons.includes('adding weight')) expect(top, `${ctx} "adding weight" → ${top}`).toBeGreaterThan(lastLoad + 1e-6);
      if (reasons.includes('Top of your plates')) expect(gymRoundUp(gym, lastLoad + 0.01, kind, sides), `${ctx} top of plates`).toBeUndefined();

      // Deloads: never heavier, and lighter whenever anything lighter can be loaded.
      const lighter = planner.lighter(lastLoad, e);
      const lightest = planner.round(0, e);
      expect(lighter, `${ctx} deload`).toBeLessThanOrEqual(Math.max(lastLoad, lightest) + 1e-6);
      if (makeable(lastLoad) && lastLoad > lightest + 1e-6) expect(lighter, `${ctx} deload lighter`).toBeLessThan(lastLoad - 1e-6);

      // The program path: the next load is heavier and makeable, or there's none and nothing heavier fits.
      if (kind !== 'plates') {
        const next = nextLoad(lastLoad, 'upperBarbell', e, gym);
        if (next === undefined) expect(gymRoundUp(gym, lastLoad + 0.01, kind, sides), `${ctx} program top`).toBeUndefined();
        else {
          expect(next, `${ctx} program next`).toBeGreaterThan(lastLoad + 1e-6);
          expect(makeable(next), `${ctx} program next ${next}`).toBe(true);
        }
      }
    }
  });
});

import { describe, expect, test } from 'vitest';
import {
  Catalog, DAY_FOCUSES, DAY_MS, EQUIPMENT, GOALS, JOINTS, LEVELS, type LoggedExercise, Planner, SPLITS, SeededRandom, VARIABILITIES,
  type WorkoutRecord, defaultPlan, gymHas, makeGym, plannedWorkingSets,
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

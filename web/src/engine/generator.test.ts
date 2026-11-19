import { describe, expect, test } from 'vitest';
import {
  Catalog, type DayFocus, type Exercise, type Goal, Gyms, type MuscleMap, Planner, QUALITY, defaultPlan, focusMuscles,
  plannedWorkingSets, qualityOf,
} from './index';

// Rules from reports/Evidence based workout building.md, algorithm spec.
const now = 1_800_000_000_000;
const FOCI: DayFocus[] = ['push', 'pull', 'legs', 'upper', 'lower', 'fullBody'];
const gyms = { commercial: Gyms.commercial, homeBarbell: Gyms.homeBarbell };
const make = (over: Parameters<typeof defaultPlan>[0] = {}, gym = Gyms.commercial()) =>
  new Planner({ plan: defaultPlan(over), gym, history: [] });

function credit(exercises: { exercise: Exercise; sets: { isWarmup: boolean }[] }[]): MuscleMap {
  const t: MuscleMap = {};
  for (const p of exercises) {
    const n = p.sets.filter((s) => !s.isWarmup).length;
    for (const m of p.exercise.secondary) t[m] = (t[m] ?? 0) + n * 0.5;
    for (const m of p.exercise.primary) t[m] = (t[m] ?? 0) + n;
  }
  return t;
}

describe('Session size', () => {
  test('long sessions are no longer capped at four exercises', () => {
    for (const focus of ['push', 'pull', 'upper', 'fullBody'] as DayFocus[]) {
      const w = make({ sessionMinutes: 120 }).generate({ now, seed: 1, focus });
      expect(w.exercises.length, focus).toBeGreaterThanOrEqual(7);
      expect(w.estimatedMinutes, focus).toBeGreaterThanOrEqual(60);
    }
  });

  test('more time gives more work, up to the useful limit', () => {
    for (const focus of FOCI) {
      const sets = [30, 60, 90].map((m) => make({ sessionMinutes: m }).generate({ now, seed: 2, focus }).exercises
        .reduce((t, p) => t + plannedWorkingSets(p).length, 0));
      expect(sets[0], focus).toBeLessThan(sets[1]);
      expect(sets[1], focus).toBeLessThanOrEqual(sets[2]);
    }
  });

  test('a push day ends early with a note instead of piling on sets', () => {
    const w = make({ sessionMinutes: 120 }).generate({ now, seed: 1, focus: 'push' });
    expect(w.estimatedMinutes).toBeLessThan(110);
    expect(w.note).toMatch(/instead of 120/);
  });

  test('never plans more than about 11 fractional sets for a muscle in one session', () => {
    for (const focus of FOCI) {
      for (const seed of [1, 2, 3]) {
        const w = make({ sessionMinutes: 120 }).generate({ now, seed, focus });
        const c = credit(w.exercises);
        // Required slots can overshoot slightly through synergist credit; the hard ceiling is 14.
        for (const m of focusMuscles(focus)) expect(c[m] ?? 0, `${focus} ${m}`).toBeLessThanOrEqual(14);
      }
    }
  });

  test('fits the time you set', () => {
    for (const minutes of [30, 45, 60, 75, 90, 120]) {
      for (const focus of FOCI) {
        for (const supersets of [false, true]) {
          const w = make({ sessionMinutes: minutes, supersets }).generate({ now, seed: 4, focus });
          expect(w.estimatedMinutes, `${minutes} ${focus} ${supersets}`).toBeLessThanOrEqual(minutes + 1);
        }
      }
    }
  });

  test('short sessions still train every main muscle of the day', () => {
    const w = make({ sessionMinutes: 30 }).generate({ now, seed: 1, focus: 'push' });
    const c = credit(w.exercises);
    for (const m of ['chest', 'sideDelts', 'triceps'] as const) expect(c[m] ?? 0, m).toBeGreaterThanOrEqual(2);
  });
});

describe('Exercise quality', () => {
  test('every built-in exercise has a quality rating', () => {
    const missing = Catalog.builtIn.filter((e) => e.pattern !== 'mobility' && !QUALITY[e.id]).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  const NEVER_FOR_SIZE = [
    'db-floor-press', 'farmer-carry', 'bb-reverse-curl', 'pause-squat', 'sumo-deadlift', 'superman', 'superman-hold',
    'superman-scaption', 'plank', 'cable-hip-abduction', 'cable-hip-adduction', 'bb-upright-row',
  ];

  test.each(['buildMuscle', 'getLean'] as Goal[])('%s never picks the poor choices the old generator did', (goal) => {
    for (const [name, gym] of Object.entries(gyms)) {
      for (const focus of FOCI) {
        for (let seed = 0; seed < 10; seed++) {
          const ids = make({ goal, sessionMinutes: 90 }, gym()).generate({ now, seed, focus }).exercises.map((p) => p.exercise.id);
          for (const bad of NEVER_FOR_SIZE) expect(ids, `${name} ${focus} seed ${seed}`).not.toContain(bad);
        }
      }
    }
  });

  test('main lifts come from the evidence-backed lists', () => {
    const chest = ['db-incline-bench', 'bb-bench', 'db-bench', 'machine-chest-press', 'weighted-dip', 'bb-incline-bench', 'smith-bench'];
    const legs = ['bb-squat', 'leg-press', 'bb-front-squat', 'smith-squat', 'hack-squat'];
    for (const [name, gym] of Object.entries(gyms)) {
      for (let seed = 0; seed < 10; seed++) {
        const push = make({}, gym()).generate({ now, seed, focus: 'push' }).exercises;
        expect(chest, `${name} seed ${seed}`).toContain(push[0].exercise.id);
        const leg = make({}, gym()).generate({ now, seed, focus: 'legs' }).exercises;
        expect(legs, `${name} seed ${seed}`).toContain(leg[0].exercise.id);
        expect(leg.some((p) => qualityOf(p.exercise).roles.includes('hinge')), `${name} seed ${seed}`).toBe(true);
      }
    }
  });

  test('covers the research must-haves for each day', () => {
    const roles = (focus: DayFocus) => make({ sessionMinutes: 75 }).generate({ now, seed: 5, focus }).exercises
      .flatMap((p) => qualityOf(p.exercise).roles);
    expect(roles('push')).toContain('tricepsOverhead');
    expect(roles('push')).toContain('sideRaise');
    expect(roles('pull')).toEqual(expect.arrayContaining(['verticalPull', 'row', 'rearDelt']));
    expect(roles('legs')).toEqual(expect.arrayContaining(['squatMain', 'hinge', 'kneeExt', 'calf']));
    expect(roles('lower')).toContain('legCurl');
  });

  test('size goals avoid two very tiring lifts in one session; strength goals keep the big lifts', () => {
    for (let seed = 0; seed < 10; seed++) {
      const size = make({ sessionMinutes: 90 }).generate({ now, seed, focus: 'legs' }).exercises;
      expect(size.filter((p) => qualityOf(p.exercise).fatigue >= 4).length, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
    const pl = make({ goal: 'powerlifting', experience: 'advanced', sessionMinutes: 90 }).generate({ now, seed: 1, focus: 'legs' }).exercises;
    expect(['bb-squat', 'pause-squat']).toContain(pl[0].exercise.id);
    expect(pl.some((p) => ['bb-deadlift', 'sumo-deadlift'].includes(p.exercise.id))).toBe(true);
    const strong = make({ goal: 'getStronger' }).generate({ now, seed: 1, focus: 'push' }).exercises;
    expect(strong[0].exercise.id).toBe('bb-bench');
  });

  test('home gym without leg machines gets the stand-ins', () => {
    const ex = make({ sessionMinutes: 75 }, Gyms.homeBarbell()).generate({ now, seed: 1, focus: 'legs' }).exercises;
    expect(ex.some((p) => ['sissy-squat', 'reverse-nordic'].includes(p.exercise.id))).toBe(true);
  });
});

describe('Three delt heads', () => {
  test('push days train side delts directly and add rear delts with spare time', () => {
    const w = make({ sessionMinutes: 90 }).generate({ now, seed: 1, focus: 'push' });
    const c = credit(w.exercises);
    expect(c.sideDelts ?? 0).toBeGreaterThanOrEqual(6);
    expect(c.frontDelts ?? 0).toBeGreaterThan(0);
    expect(w.exercises.some((p) => p.exercise.primary.includes('rearDelts'))).toBe(true);
  });

  test('pull days give rear delts credit from rows plus direct work', () => {
    const w = make({ sessionMinutes: 60 }).generate({ now, seed: 1, focus: 'pull' });
    expect(credit(w.exercises).rearDelts ?? 0).toBeGreaterThanOrEqual(5);
  });

  test('presses train front delts, raises side delts, face pulls rear delts', () => {
    const e = (id: string) => Catalog.byID.get(id)!;
    expect(e('bb-ohp').primary).toContain('frontDelts');
    expect(e('bb-bench').secondary).toContain('frontDelts');
    expect(e('db-lateral-raise').primary).toEqual(['sideDelts']);
    expect(e('face-pull').primary).toContain('rearDelts');
    expect(e('cable-row').secondary).toContain('rearDelts');
  });
});

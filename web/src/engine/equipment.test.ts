import { describe, expect, test } from 'vitest';
import { Catalog, EQUIPMENT, Gyms, Planner, defaultPlan, gymHas, makeGym, provides, readExercise, readGym } from './index';

const byID = (id: string) => Catalog.byID.get(id)!;
const OLD_FULL = ['barbell', 'ezBar', 'trapBar', 'dumbbell', 'kettlebell', 'bench', 'squatRack', 'pullUpBar', 'dipStation', 'cable',
  'latPulldown', 'legPress', 'legCurl', 'legExtension', 'chestPressMachine', 'shoulderPressMachine', 'smithMachine', 'resistanceBand'];

describe('Specific equipment', () => {
  test('stations provide pulley positions', () => {
    expect([...provides(['latPulldown'])]).toEqual(['latPulldown', 'cableHigh']);
    expect([...provides(['lowRow'])]).toEqual(['cableLow']);
    const column = provides(['cableColumn']);
    for (const n of ['cableHigh', 'cableLow', 'cableAdjustable'] as const) expect(column.has(n)).toBe(true);
    expect(provides(['flatBench']).has('adjustableBench')).toBe(false);
    expect([...provides(['adjustableBench'])].sort()).toEqual(['adjustableBench', 'bench', 'preacherBench']);
  });

  test('a pulldown/row station with attachments gets the right cable work', () => {
    const home = Gyms.homeBarbell();
    for (const id of ['face-pull', 'cable-crunch', 'cable-lateral-raise', 'tricep-pushdown', 'cable-row', 'v-bar-pulldown', 'cable-overhead-tricep-ext', 'ez-preacher-curl']) {
      expect(gymHas(home, byID(id)), id).toBe(true);
    }
    // Needs a pulley at chest height, a back-extension bench, an ankle strap, an ab wheel.
    for (const id of ['cable-fly', 'back-extension', 'cable-hip-abduction', 'ab-rollout']) expect(gymHas(home, byID(id)), id).toBe(false);
  });

  test('a flat bench alone rules out incline work', () => {
    const g = makeGym('Flat', ['dumbbell', 'flatBench']);
    expect(gymHas(g, byID('db-bench'))).toBe(true);
    expect(gymHas(g, byID('db-incline-bench'))).toBe(false);
    expect(gymHas(g, byID('incline-db-curl'))).toBe(false);
    const w = new Planner({ plan: defaultPlan({ sessionMinutes: 90 }), gym: g, history: [] }).generate({ now: 1_800_000_000_000, seed: 1, focus: 'push' });
    expect(w.exercises.every((p) => gymHas(g, p.exercise))).toBe(true);
  });

  test('older gyms convert, and a full old list becomes a full gym', () => {
    const full = readGym({ id: 'a', name: 'Gym', equipment: OLD_FULL })!;
    expect(full.equipment).toEqual([...EQUIPMENT]);
    expect(full.reviewEquipment).toBeUndefined();
    const home = readGym({ id: 'b', name: 'Home', equipment: ['barbell', 'dumbbell', 'bench', 'dipStation', 'cable', 'latPulldown'] })!;
    expect(home.equipment).toEqual(expect.arrayContaining(['flatBench', 'adjustableBench', 'cableColumn', 'rope', 'vBar', 'dipBelt', 'latPulldown']));
    expect(home.equipment).not.toContain('cableDual');
    expect(home.reviewEquipment).toBe(true);
    // Saved in the new format: read back as is.
    const again = readGym(JSON.parse(JSON.stringify({ ...home, reviewEquipment: undefined })))!;
    expect(again.equipment).toEqual(home.equipment);
    expect(again.reviewEquipment).toBeUndefined();
  });

  test('custom exercises saved with "cable" ask for an adjustable pulley', () => {
    const e = readExercise({ id: 'custom-x', name: 'X', primary: ['chest'], equipment: ['cable', 'bench'] })!;
    expect(e.equipment).toEqual(['cableAdjustable', 'bench']);
  });

  test('every built-in exercise is possible in a full gym', () => {
    const full = Gyms.commercial();
    expect(Catalog.builtIn.filter((e) => !gymHas(full, e)).map((e) => e.id)).toEqual([]);
  });
});

describe('Research picks', () => {
  const NEW = ['bayesian-cable-curl', 'cable-reverse-fly', 'low-to-high-cable-fly', 'kneeling-cable-pulldown', 'cable-y-raise', 'jm-press',
    'chest-supported-rear-raise', 'spider-curl', 'deficit-reverse-lunge', 'reverse-nordic', 'pec-deck', 'reverse-pec-deck', 'hack-squat',
    'seated-leg-curl', 'calf-machine-raise', 'leg-press-calf-raise', 'machine-lateral-raise', 'machine-row', 'machine-hip-abduction',
    'machine-hip-adduction', 'cable-leg-curl', 'cable-leg-extension', 'cable-pull-through', 'weighted-pull-up'];

  test('each has a rating and instructions with tips', async () => {
    const { QUALITY, guideFor } = await import('./index');
    for (const id of NEW) {
      expect(Catalog.byID.get(id), id).toBeDefined();
      expect(QUALITY[id], id).toBeDefined();
      const g = guideFor(byID(id))!;
      expect(g.steps.length, id).toBeGreaterThanOrEqual(3);
      expect(g.tips?.length, id).toBeGreaterThanOrEqual(2);
      expect(g.mistake, id).toBeTruthy();
    }
  });

  const plan = (gym: ReturnType<typeof makeGym>, focus: 'push' | 'pull' | 'legs') =>
    new Planner({ plan: defaultPlan({ sessionMinutes: 75 }), gym, history: [] }).generate({ now: 1_800_000_000_000, seed: 1, focus })
      .exercises.map((p) => p.exercise.id);

  test('a home pulldown/row station gets the new cable picks', () => {
    const home = Gyms.homeBarbell();
    for (const id of ['bayesian-cable-curl', 'cable-reverse-fly', 'low-to-high-cable-fly', 'cable-y-raise']) expect(gymHas(home, byID(id)), id).toBe(true);
    expect(plan(home, 'push')).toEqual(expect.arrayContaining([expect.stringMatching(/fly|dip/)]));
  });

  test('a full gym uses the seated leg curl and the pec deck', () => {
    const full = Gyms.commercial();
    expect(plan(full, 'legs')).not.toContain('leg-curl');
    const ids = Array.from({ length: 6 }, (_, s) => new Planner({ plan: defaultPlan({ sessionMinutes: 90 }), gym: full, history: [] })
      .generate({ now: 1_800_000_000_000, seed: s, focus: 'push' }).exercises.map((p) => p.exercise.id)).flat();
    expect(ids.some((id) => ['pec-deck', 'cable-fly'].includes(id))).toBe(true);
  });

  test('an ankle strap unlocks cable leg curls and extensions', () => {
    const strap = makeGym('Home', [...Gyms.homeBarbell().equipment, 'ankleStrap']);
    expect(gymHas(strap, byID('cable-leg-curl'))).toBe(true);
    expect(gymHas(strap, byID('cable-leg-extension'))).toBe(true);
    expect(gymHas(Gyms.homeBarbell(), byID('cable-leg-curl'))).toBe(false);
  });
});

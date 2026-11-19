import { describe, expect, test } from 'vitest';
import {
  type Gym, Catalog, Gyms, HOME_PLATES, POUNDS_PER_KG, STANDARD_PLATES, gymBar, gymBaseLoadKg, gymIncrement, gymPlates, gymRound,
  makeGym, nearestLoadable, nextLoad, platesPerSide, withGymUnits,
} from '.';
import { readGym } from './decode';
import { plateSetup, platesPerSide as displayPlates } from '../lib/plates';

const kgGym = (over: Partial<Gym> = {}): Gym => ({ ...makeGym('Test', ['barbell', 'ezBar', 'smithMachine', 'dumbbell', 'flatBench', 'squatRack']), ...over });
const lbGym = (over: Partial<Gym> = {}): Gym => kgGym({ usesPounds: true, ...over });
const stock = (...w: (number | [number, number])[]) => w.map((x) => (Array.isArray(x) ? { weight: x[0], pairs: x[1] } : { weight: x }));
const lb = (n: number) => n / POUNDS_PER_KG;

describe('plate math with the gym\'s plates', () => {
  test('standard plates load heaviest first, as before', () => {
    expect(platesPerSide(100, 20, stock(...STANDARD_PLATES.kg))).toEqual({ plates: [25, 15], remainder: 0 });
    expect(displayPlates(225, 45, true)).toEqual({ plates: [45, 45], remainder: 0 });
    // No 1.25 lb plates in the standard set: the last 1.25 a side is left over, as before.
    expect(displayPlates(137.5, 45, true)).toEqual({ plates: [45], remainder: 1.25 });
  });

  test('limited pairs are used up, then lighter plates make up the rest', () => {
    expect(platesPerSide(100, 20, stock([20, 1], [10, 1], 5))).toEqual({ plates: [20, 10, 5, 5], remainder: 0 });
  });

  test('reports the remainder when the plates run out', () => {
    expect(platesPerSide(120, 20, stock([20, 1], [10, 1]))).toEqual({ plates: [20, 10], remainder: 20 });
  });

  test('finds a combination greedy loading would miss', () => {
    // 20 a side: one 15 leaves 5 that nothing makes, but two 10s do it.
    expect(platesPerSide(60, 20, stock(15, 10))).toEqual({ plates: [10, 10], remainder: 0 });
  });

  test('a weight between plates reports what is left over', () => {
    expect(platesPerSide(62, 20, stock(10, 5))).toEqual({ plates: [10, 10], remainder: 1 });
    expect(platesPerSide(15, 20, stock(10))).toEqual({ plates: [], remainder: 0 });
  });

  test('nearest loadable total never drops below the bar', () => {
    expect(nearestLoadable(10, 20, stock(5))).toBe(20);
    expect(nearestLoadable(36, 20, stock(5))).toBe(40);
    expect(nearestLoadable(500, 20, stock([20, 2]))).toBe(100);
  });
});

describe('rounding with the gym\'s plates', () => {
  test('5 kg smallest plate: steps of 10 kg and loads it can make', () => {
    const g = kgGym({ plates: stock(20, 10, 5) });
    expect(gymIncrement(g, 'barbell')).toBe(10);
    expect(gymIncrement(g, 'smithMachine')).toBe(10);
    expect(gymIncrement(g, 'dumbbell')).toBe(2);
    expect(gymRound(g, 102, 'barbell')).toBe(100);
    expect(gymRound(g, 106, 'barbell')).toBe(110);
    expect(gymRound(g, 5, 'barbell')).toBe(20);
    // Progression from 80 kg goes up a whole 10 kg rather than an unloadable 2.5.
    expect(nextLoad(80, 'upperBarbell', Catalog.exercise('bb-bench'), g)).toBe(90);
  });

  test('10 lb smallest plate: steps of 20 lb', () => {
    const g = lbGym({ plates: stock(45, 25, 10) });
    expect(gymIncrement(g, 'barbell')).toBe(20);
    expect(gymRound(g, lb(140), 'barbell') * POUNDS_PER_KG).toBeCloseTo(145);
    expect(gymRound(g, lb(10), 'barbell') * POUNDS_PER_KG).toBeCloseTo(45);
  });

  test('an explicit step still wins, but the load lands on what the plates make', () => {
    const g = kgGym({ plates: stock(20, 10, 5), increments: { barbell: 2.5 } });
    expect(gymIncrement(g, 'barbell')).toBe(2.5);
    expect(gymRound(g, 62.5, 'barbell')).toBe(60);
  });

  test('limited pairs cap the load', () => {
    const g = kgGym({ plates: stock([20, 2], [10, 1]) });
    expect(gymRound(g, 300, 'barbell')).toBe(120);
  });

  test('bar weights come from the gym', () => {
    const g = kgGym({ bars: { barbell: 15, ezBar: 7.5, smithMachine: 10 } });
    expect(gymBar(g, 'barbell')).toBe(15);
    expect(gymBaseLoadKg(g, 'ezBar')).toBe(7.5);
    expect(gymRound(g, 10, 'barbell')).toBe(15);
    expect(gymRound(g, 18, 'barbell')).toBe(17.5);
    expect(gymRound(g, 0, 'smithMachine')).toBe(10);
    expect(gymBar(g, 'trapBar')).toBe(20);
    expect(gymBaseLoadKg(lbGym({ bars: { barbell: 35 } }), 'barbell') * POUNDS_PER_KG).toBeCloseTo(35);
  });
});

describe('gyms without plates or bars behave as before', () => {
  test('defaults are unchanged', () => {
    const g = Gyms.commercial();
    expect(g.plates).toBeUndefined();
    expect(gymIncrement(g, 'barbell')).toBe(2.5);
    expect(gymIncrement(lbGym(), 'barbell')).toBe(5);
    expect(gymBar(g, 'ezBar')).toBe(10);
    expect(gymBar(lbGym(), 'barbell')).toBe(45);
    expect(gymRound(g, 61, 'barbell')).toBe(60);
    expect(gymRound(g, 86, 'barbell')).toBe(85);
    expect(gymPlates(g).map((p) => p.weight)).toEqual(STANDARD_PLATES.kg);
  });

  test('an old stored gym reads without plates, bars or a review flag', () => {
    const old = { id: 'g1', name: 'Old', equipment: ['barbell', 'dumbbell'], equipmentVersion: 2, usesPounds: false, increments: { barbell: 5 } };
    const g = readGym(old)!;
    expect(g).toEqual(old);
    expect('plates' in g || 'bars' in g || 'reviewEquipment' in g).toBe(false);
  });

  test('a gym with plates and bars survives a backup round trip', () => {
    const g = kgGym({ plates: stock([20, 2], 10, 1.25), bars: { barbell: 15 } });
    expect(readGym(JSON.parse(JSON.stringify(g)))).toEqual(g);
  });
});

describe('decoding plates and bars', () => {
  test('drops bad values and keeps the rest', () => {
    const g = readGym({
      id: 'g', name: 'G', equipment: ['barbell'], equipmentVersion: 2, usesPounds: false, increments: {},
      plates: [{ weight: 20, pairs: 2 }, { weight: 'x' }, { weight: -5 }, { weight: 0 }, { weight: 1000 }, 10, null, 'x',
        { weight: 5, pairs: 0 }, { weight: 5, pairs: 3 }, { weight: 2.5, pairs: -1 }, { weight: 1.25, pairs: 999 }],
      bars: { barbell: 15, ezBar: -1, trapBar: 'heavy', smithMachine: 999, junk: 5 },
    })!;
    expect(g.plates).toEqual([{ weight: 20, pairs: 2 }, { weight: 10 }, { weight: 5 }, { weight: 2.5 }, { weight: 1.25 }]);
    expect(g.bars).toEqual({ barbell: 15 });
  });

  test('nothing usable leaves the fields unset', () => {
    const g = readGym({ id: 'g', name: 'G', equipment: [], equipmentVersion: 2, plates: [{ weight: NaN }], bars: { barbell: 0 } })!;
    expect(g.plates).toBeUndefined();
    expect(g.bars).toBeUndefined();
    expect(readGym({ id: 'g', plates: 'lots', bars: [20] })!.plates).toBeUndefined();
  });
});

describe('presets and units', () => {
  test('the home preset has a typical home set, kept across a unit switch', () => {
    const home = Gyms.homeBarbell();
    expect(home.plates!.map((p) => p.weight)).toEqual(HOME_PLATES.kg);
    expect(withGymUnits(home, true).plates!.map((p) => p.weight)).toEqual(HOME_PLATES.lb);
    expect(withGymUnits(Gyms.commercial(), true).plates).toBeUndefined();
  });

  test('a custom list and bar weights are dropped on a unit switch', () => {
    const g = withGymUnits(kgGym({ plates: stock([20, 2], 5), bars: { barbell: 15 }, increments: { barbell: 5 } }), true);
    expect(g.usesPounds).toBe(true);
    expect(g.plates).toBeUndefined();
    expect(g.bars).toBeUndefined();
    expect(g.increments).toEqual({});
  });
});

describe('plate breakdown setup', () => {
  const bench = Catalog.exercise('bb-bench');
  test('uses the active gym\'s plates and bar', () => {
    const g = kgGym({ plates: stock(20, 5), bars: { barbell: 15 } });
    expect(plateSetup(bench, g, false)).toEqual({ bar: 15, plates: stock(20, 5) });
  });
  test('falls back to standard plates when the gym is in the other unit', () => {
    const g = kgGym({ plates: stock(20, 5), bars: { barbell: 15 } });
    expect(plateSetup(bench, g, true)?.bar).toBe(45);
  });
  test('a Smith machine shows plates only once its start weight is set', () => {
    const smith = Catalog.all.find((e) => e.equipment.includes('smithMachine') && !e.equipment.includes('barbell'))!;
    expect(plateSetup(smith, kgGym(), false)).toBeUndefined();
    expect(plateSetup(smith, kgGym({ bars: { smithMachine: 10 } }), false)?.bar).toBe(10);
  });
});

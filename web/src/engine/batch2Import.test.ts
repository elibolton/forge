import { describe, expect, test } from 'vitest';
import { Catalog, NameMatcher, newImports, parseDate, parseHistory } from './index';

// Bug hunt batch 2, CSV import (S6–S10).

const now = new Date(2025, 5, 1).getTime();
const csv = (rows: string[], header = 'Date,Exercise,Reps,Weight(kg)') => [header, ...rows].join('\n') + '\n';

describe('Assisted exercises (S6)', () => {
  test('are not matched to the plain exercise, and never import their weight as load', () => {
    const r = parseHistory(csv(['2024-01-15,Pull Up (Assisted),8,18', '2024-01-15,Assisted Dip,10,20']), false, {}, Catalog.all, now);
    expect(r.unmatched).toEqual({ 'Pull Up (Assisted)': 1, 'Assisted Dip': 1 });
    const manual = parseHistory(csv(['2024-01-15,Pull Up (Assisted),8,18']), false, { 'Pull Up (Assisted)': 'pull-up' }, Catalog.all, now);
    expect(manual.workouts[0].exercises[0].sets[0].weight).toBe(0);
  });

  test('a negative weight is never a load', () => {
    const r = parseHistory(csv(['2024-01-15,Pull Up,8,-20']), false, {}, Catalog.all, now);
    expect(r.workouts[0].exercises[0].sets[0].weight).toBe(0);
    expect(r.badWeights).toBe(1);
  });
});

describe('Decimal commas (S7)', () => {
  test('semicolon files with 62,5 read as 62.5', () => {
    const r = parseHistory('Date;Exercise;Reps;Weight(kg)\n2024-01-15;Bench Press (Barbell);5;62,5\n2024-01-15;Bench Press (Barbell);5;"60,25"\n', false, {}, Catalog.all, now);
    expect(r.workouts[0].exercises[0].sets.map((s) => s.weight)).toEqual([62.5, 60.25]);
    expect(r.badWeights).toBe(0);
  });

  test('a weight that cannot be read is counted', () => {
    const r = parseHistory(csv(['2024-01-15,Bench Press (Barbell),5,heavy']), false, {}, Catalog.all, now);
    expect(r.badWeights).toBe(1);
  });
});

describe('Dates (S8)', () => {
  test('impossible dates are rejected instead of rolling over', () => {
    expect(parseDate('2024-02-30')).toBeUndefined();
    expect(parseDate('99/99/2024')).toBeUndefined();
    expect(parseDate('2024-02-29')).toBe(new Date(2024, 1, 29).getTime());
  });

  test('DD/MM dates are read day first when the first number cannot be a month', () => {
    expect(parseDate('25/12/2024')).toBe(new Date(2024, 11, 25).getTime());
    expect(parseDate('05/01/2024')).toBe(new Date(2024, 4, 1).getTime());
    expect(parseDate('05/01/2024', { dayFirst: true })).toBe(new Date(2024, 0, 5).getTime());
  });

  test('a file with any DD/MM date reads all its dates day first; future dates are skipped', () => {
    const r = parseHistory(csv(['25/12/2024,Bench Press (Barbell),5,60', '05/01/2025,Bench Press (Barbell),5,60', '05/01/2030,Bench Press (Barbell),5,60']),
      false, {}, Catalog.all, now);
    expect(r.workouts.map((w) => w.date)).toEqual([new Date(2024, 11, 25).getTime(), new Date(2025, 0, 5).getTime()]);
    expect(r.badDates).toBe(1);
  });
});

describe('Large files (S9)', () => {
  test('30,000 rows parse quickly, matching each name once', () => {
    const names = ['Bench Press (Barbell)', 'Squat (Barbell)', 'Lat Pulldown (Cable)', 'Bicep Curl (Dumbbell)', 'Mystery Move'];
    const rows: string[] = [];
    for (let i = 0; i < 30_000; i++) rows.push(`2024-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')},${names[i % names.length]},8,50`);
    const t0 = performance.now();
    const r = parseHistory(csv(rows), false, {}, Catalog.all, now);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(r.unmatched['Mystery Move']).toBe(6000);
  });

  test('the matcher gives the same answers', () => {
    const m = new NameMatcher(Catalog.all);
    expect(m.match('Bench Press (Barbell)')?.id).toBe('bb-bench');
    expect(m.match('Incline Dumbbell Curl')?.id).toBe('incline-db-curl');
  });
});

describe('Importing again (S10)', () => {
  const day = new Date(2024, 0, 15, 18).getTime();
  const bench = { exerciseID: 'bb-bench', sets: [{ weight: 60, reps: 5, isWarmup: false }] };
  const squat = { exerciseID: 'bb-squat', sets: [{ weight: 80, reps: 5, isWarmup: false }] };

  test('adds only exercises not already logged that day', () => {
    const imported = [{ date: day, focus: null, exercises: [bench, squat] }];
    expect(newImports(imported, [{ date: day + 3_600_000, exercises: [bench] }])).toEqual([{ date: day, focus: null, exercises: [squat] }]);
    expect(newImports(imported, [{ date: day, exercises: [bench, squat] }])).toEqual([]);
    expect(newImports(imported, [])).toEqual(imported);
  });

  test('a Forge workout the same day does not block the imported one', () => {
    const forge = { date: day - 3_600_000, exercises: [{ exerciseID: 'pull-up', sets: [{ weight: 0, reps: 8, isWarmup: false }] }] };
    expect(newImports([{ date: day, focus: null, exercises: [bench] }], [forge])).toHaveLength(1);
  });
});

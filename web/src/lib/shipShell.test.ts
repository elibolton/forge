import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Pre-launch shell and screens fixes (ship audit items 2, 3, 8, 11, 14, 15, 16).
const persist = vi.fn(async () => false);
vi.mock('./db', () => ({
  db: { get: vi.fn(async () => undefined), set: async () => {}, del: async () => {}, update: async () => {}, put: async () => {}, delete: async () => {}, replace: async () => {}, all: async () => [], allLogs: async () => [], putLogs: async () => {}, deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: () => persist(),
}));
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

const { Gyms, Planner, defaultPlan, Programs } = await import('../engine');
const { app } = await import('./store.svelte');
const { backupDue, snoozeBackup } = await import('./backup');
const { storageGuard, safariBanner } = await import('./install.svelte');
const { planParts, changedParts, changeText } = await import('./planChange');
const { hasTimeOfDay, logDateText, logStats, trainedDetail } = await import('./logFormat');
const { agreeingReasons, sessionFromLog } = await import('./templateStart');
const { durationText } = await import('./units');
const { statsBetween } = await import('./report');
const { dayTitle, splitTitle } = await import('./labels');
const { breakable, gymFit, programInfo } = await import('./programInfo');
type WorkoutLog = import('./store.svelte').WorkoutLog;

const DAY = 86_400_000;
const log = (id: string, date: number, o: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id, date, focus: 'pull', durationSeconds: 170, program: null,
  exercises: [{ exerciseID: 'bb-row', targetReps: 8, slotID: null, repRange: null, targetRIR: null,
    sets: [{ weight: 60, reps: 8, rir: 2, isWarmup: false, side: null }, { weight: 60, reps: 8, rir: 1, isWarmup: false, side: null },
      { weight: 30, reps: 8, rir: null, isWarmup: true, side: null }] }],
  ...o,
});

beforeEach(() => {
  app.createProfile(defaultPlan(), Gyms.commercial(), false);
  app.restoreLogs([]);
  for (const k of ['lastBackupAt', 'backupLogCount', 'backupLogIDs', 'backupSnoozeUntil']) app.set(k, undefined);
});

describe('Data safety (item 2)', () => {
  afterEach(() => { storageGuard.persisted = null; storageGuard.installed = false; });

  test('the first backup nudge comes after the first workout when storage could be cleared', () => {
    app.restoreLogs([log('a', 1)]);
    expect(backupDue(10, false)).toBe(true);
  });

  test('installed with protected storage, it waits for the second workout', () => {
    app.restoreLogs([log('a', 1)]);
    expect(backupDue(10, true)).toBe(false);
    app.addLog(log('b', 2));
    expect(backupDue(10, true)).toBe(true);
  });

  test('after a backup, unprotected storage is nudged weekly and protected every two weeks', () => {
    app.restoreLogs([log('a', 1), log('b', 2)]);
    app.set('lastBackupAt', 0);
    app.set('backupLogIDs', ['a']);
    expect(backupDue(8 * DAY, false)).toBe(true);
    expect(backupDue(8 * DAY, true)).toBe(false);
    expect(backupDue(15 * DAY, true)).toBe(true);
  });

  test('"Later" waits three days before the first backup, a week after', () => {
    app.restoreLogs([log('a', 1)]);
    snoozeBackup(0);
    expect(backupDue(2 * DAY, false)).toBe(false);
    expect(backupDue(3 * DAY + 1, false)).toBe(true);
  });

  test('the persist() answer is kept, and once granted it is not asked for again', async () => {
    persist.mockResolvedValueOnce(true);
    expect(await storageGuard.request()).toBe(true);
    expect(storageGuard.persisted).toBe(true);
    persist.mockClear();
    expect(await storageGuard.request()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  test('a workout logged while storage is unprotected asks again', async () => {
    storageGuard.persisted = false;
    persist.mockClear();
    app.addLog(log('a', 1));
    expect(persist).toHaveBeenCalled();
  });

  test('safe means installed and persisted', () => {
    storageGuard.persisted = true;
    expect(storageGuard.safe).toBe(false);
    storageGuard.installed = true;
    expect(storageGuard.safe).toBe(true);
  });

  test('the Safari banner hides for the visit once dismissed', () => {
    safariBanner.hidden = false;
    safariBanner.dismiss();
    expect(safariBanner.hidden).toBe(true);
  });
});

describe('What changed since today\'s workout was built (item 8)', () => {
  test('adding an injury is named', () => {
    const before = planParts(app.profile!);
    app.updatePlan((p) => { p.injuries = ['shoulder']; });
    const labels = changedParts(before, planParts(app.profile!));
    expect(labels).toEqual(['Injuries']);
    expect(changeText(labels)).toBe('Injuries changed');
  });

  test('several changes read as a list; another gym covers its own equipment', () => {
    expect(changeText(['Injuries', 'Equipment'])).toBe('Injuries and equipment changed');
    expect(changeText(['Goal', 'Split', 'Injuries', 'Equipment', 'Units'])).toBe('Goal, split, injuries and 2 more changed');
    const before = planParts(app.profile!);
    const home = { ...Gyms.home(), id: 'home' };
    app.updateProfile((p) => { p.gyms.push(home); p.activeGymID = 'home'; });
    expect(changedParts(before, planParts(app.profile!))).toEqual(['Gym']);
  });

  test('a plan saved before the parts were kept gets a general line', () => {
    expect(changeText(changedParts(undefined, planParts(app.profile!)))).toBe('Your settings changed');
  });
});

describe('History and repeat (item 14)', () => {
  test('a past workout reads as date, time, duration and working sets', () => {
    const d = new Date(2026, 10, 19, 23, 48).getTime();
    const l = log('a', d);
    expect(logDateText(l, d)).toMatch(/Nov 19 · 11:48/);
    expect(logStats(l)).toBe('3 min · 2 sets');
  });

  test('an imported workout (midnight, no duration) shows no placeholder time', () => {
    const midnight = new Date(2026, 10, 20).getTime();
    const imported = log('i', midnight, { durationSeconds: 0, focus: null });
    expect(hasTimeOfDay(imported)).toBe(false);
    expect(logDateText(imported, midnight)).not.toMatch(/12:00/);
    expect(logStats(imported)).toBe('2 sets');
  });

  test('repeating a workout keeps its exercises, sets and reps', () => {
    const planner = new Planner({ plan: defaultPlan(), gym: Gyms.commercial(), history: [] });
    const s = sessionFromLog(log('a', new Date(2026, 10, 19).getTime()), 'Pull Day', planner);
    expect(s.title).toBe('Pull Day');
    expect(s.exercises.map((x) => x.exerciseID)).toEqual(['bb-row']);
    const working = s.exercises[0].sets.filter((x) => !x.isWarmup);
    expect(working.map((x) => x.reps)).toEqual([8, 8]);
    expect(s.exercises[0].reasons[0]).toMatch(/Repeating your Nov 19 workout/);
  });

  test('advice naming other reps than the prefill is dropped (item 16)', () => {
    expect(agreeingReasons(['Same weight: aim for 7 reps on every set', 'From your recent sets'], 6)).toEqual(['From your recent sets']);
    expect(agreeingReasons(['Same weight: aim for 6 reps on every set'], 6)).toEqual(['Same weight: aim for 6 reps on every set']);
    expect(agreeingReasons(['The next weight is a big jump: build to 12 reps first'], 10)).toEqual([]);
  });
});

describe('Wording and numbers (items 11, 16)', () => {
  test('a workout\'s row and the weekly report agree on its minutes', () => {
    const l = log('a', 5);
    expect(durationText(l.durationSeconds)).toBe('3 min');
    expect(statsBetween([l], 0, 10).minutes).toBe(3);
  });

  test('the recovery-based split has one name', () => {
    expect(dayTitle('recovered')).toBe(splitTitle.freshMuscles);
  });

  test('Trained today names the day the way history does', () => {
    expect(trainedDetail(log('a', 1))).toBe('Pull Day · 3 min · 2 sets');
  });
});

describe('Programs (item 15)', () => {
  test('the program is described in plain words, with its equipment', () => {
    const info = programInfo(Programs.pplul8);
    expect(info.about).not.toMatch(/RIR|hypertrophy|long-length/i);
    expect(info.equipment.join(' ')).toMatch(/Dip station/);
    expect(info.suits).toMatch(/5 days a week/);
  });

  test('a full gym fits every exercise; no equipment fits few', () => {
    const full = gymFit(Programs.pplul8, Gyms.commercial());
    expect(full.fits).toBe(full.total);
    expect(gymFit(Programs.pplul8, Gyms.bodyweight()).fits).toBeLessThan(full.total);
  });

  test('a long name can wrap after each slash', () => {
    expect(breakable('Push/Pull')).toBe('Push/​Pull');
  });
});

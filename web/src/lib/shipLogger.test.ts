import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Ship audit, logger and iPhone: A1 (rest chime), A3 (steppers and VoiceOver), A5 (wake lock),
// A8 (announcements and spoken labels), F3 (rest per exercise).
vi.mock('./db', () => ({
  db: { get: vi.fn(async () => undefined), set: async () => {}, del: async () => {}, allLogs: async () => [], putLogs: vi.fn(async () => {}), deleteLog: async () => {}, replaceLogs: async () => {}, clear: async () => {} },
  requestPersistence: async () => false,
}));

const { Catalog, Gyms, defaultPlan, makeScheme } = await import('../engine');
const { app, readExerciseRest } = await import('./store.svelte');
const { session, newSet, wakeLockUnreliable } = await import('./session.svelte');
const { configureAudioSession, resumeAudio, playWhenReady } = await import('./sounds');
const { StepperPress } = await import('./stepperPress');
const { announce, announceSoon, registerLiveRegion, repsLeftText, stepperLabel } = await import('./announce');
const { applyRestPreferences, restLabel, restSpoken } = await import('./restPrefs');
type SessionExercise = import('./session.svelte').SessionExercise;

function fakeAudio(state: string) {
  const ctx = {
    state, currentTime: 0, destination: {},
    resume: vi.fn(async () => { ctx.state = 'running'; }),
    createOscillator: vi.fn(() => ({ type: '', frequency: { value: 0 }, connect: (x: unknown) => x, start: () => {}, stop: () => {} })),
    createGain: vi.fn(() => ({ gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: (x: unknown) => x })),
  };
  return ctx;
}

const compound = Catalog.all.find((e) => e.isCompound && !e.isTimed && e.pattern !== 'mobility')!;
const isolation = Catalog.all.find((e) => !e.isCompound && !e.isTimed && e.pattern !== 'mobility')!;

function exercise(id: string, exerciseID: string, o: Partial<SessionExercise> = {}): SessionExercise {
  return { id, exerciseID, sets: [newSet(50, 8), newSet(50, 8)], restSeconds: 120, targetRIR: 2, targetReps: 8, rir: null, reasons: [], ...o };
}

beforeEach(() => {
  app.createProfile(defaultPlan(), Gyms.commercial(), false);
  app.restoreLogs([]);
  session.discard();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Rest chime on iPhone (A1)', () => {
  test('audio is resumed from any state but running, including iOS "interrupted"', async () => {
    for (const state of ['suspended', 'interrupted']) {
      const ctx = fakeAudio(state);
      await resumeAudio(ctx as unknown as AudioContext);
      expect(ctx.resume).toHaveBeenCalledOnce();
      expect(ctx.state).toBe('running');
    }
    const running = fakeAudio('running');
    await resumeAudio(running as unknown as AudioContext);
    expect(running.resume).not.toHaveBeenCalled();
  });

  test('a chime after an interruption wakes the audio first, then plays', async () => {
    const ctx = fakeAudio('interrupted');
    await playWhenReady(ctx as unknown as AudioContext, 'chime');
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.createOscillator).toHaveBeenCalled();
    const silent = fakeAudio('interrupted');
    await playWhenReady(silent as unknown as AudioContext, 'off');
    expect(silent.createOscillator).not.toHaveBeenCalled();
  });

  test('the iOS audio session ducks music ("transient"), and is skipped where unsupported', () => {
    const nav = { audioSession: { type: 'auto' } };
    expect(configureAudioSession(nav)).toBe(true);
    expect(nav.audioSession.type).toBe('transient');
    expect(configureAudioSession({})).toBe(false);
    expect(configureAudioSession(undefined)).toBe(false);
  });

  test('unlocking resumes an existing context that iOS interrupted', () => {
    const ctx = fakeAudio('interrupted');
    vi.stubGlobal('AudioContext', vi.fn(() => ctx));
    session.startEmpty(true);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    ctx.state = 'interrupted';
    session.unlockAudio();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    ctx.state = 'interrupted';
    session.resumeAudioIfStarted();
    expect(ctx.resume).toHaveBeenCalledTimes(3);
  });
});

describe('Steppers with VoiceOver (A3)', () => {
  test('a click with no pointer press before it (a VoiceOver double-tap) steps', () => {
    const step = vi.fn();
    new StepperPress(step).click();
    expect(step).toHaveBeenCalledOnce();
  });

  test('a quick tap steps once, on the click', () => {
    vi.useFakeTimers();
    const step = vi.fn();
    const p = new StepperPress(step);
    p.down();
    expect(step).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    p.up();
    p.click();
    expect(step).toHaveBeenCalledOnce();
  });

  test('holding repeats, and the click that ends the hold is ignored', () => {
    vi.useFakeTimers();
    const step = vi.fn();
    const p = new StepperPress(step);
    p.down();
    vi.advanceTimersByTime(420 + 140 * 3);
    const held = step.mock.calls.length;
    expect(held).toBeGreaterThanOrEqual(4);
    p.up();
    p.click();
    expect(step).toHaveBeenCalledTimes(held);
    // The next tap is a normal step again.
    p.click();
    expect(step).toHaveBeenCalledTimes(held + 1);
  });

  test('a hold that ended without a click (finger slid off) does not swallow a later VoiceOver tap', () => {
    vi.useFakeTimers();
    const step = vi.fn();
    const p = new StepperPress(step);
    p.down();
    vi.advanceTimersByTime(500);
    p.up();
    vi.advanceTimersByTime(2000);
    const before = step.mock.calls.length;
    p.click();
    expect(step).toHaveBeenCalledTimes(before + 1);
  });

  test('a cancelled press (the page scrolled) does not step', () => {
    vi.useFakeTimers();
    const step = vi.fn();
    const p = new StepperPress(step);
    p.down();
    vi.advanceTimersByTime(100);
    p.cancel();
    vi.advanceTimersByTime(2000);
    expect(step).not.toHaveBeenCalled();
  });
});

describe('Screen lock fallback (A5)', () => {
  const ios = (v: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15`;
  test('Home Screen apps below iOS 18.4 are flagged; newer ones and Safari tabs are not', () => {
    expect(wakeLockUnreliable(ios('17_5'), true)).toBe(true);
    expect(wakeLockUnreliable(ios('18_3_1'), true)).toBe(true);
    expect(wakeLockUnreliable(ios('18_4'), true)).toBe(false);
    expect(wakeLockUnreliable(ios('26_1'), true)).toBe(false);
    expect(wakeLockUnreliable(ios('17_5'), false)).toBe(false);
    expect(wakeLockUnreliable('Mozilla/5.0 (Linux; Android 14)', true)).toBe(false);
  });

  async function keepAwakeWith(wakeLock: unknown) {
    vi.stubGlobal('document', { visibilityState: 'visible' });
    vi.stubGlobal('navigator', { userAgent: 'test', wakeLock });
    session.startEmpty(true);
    session.wakeLockWorks = true;
    await session.keepAwake();
    return session.wakeLockWorks;
  }

  test('no Wake Lock API or a refused request turns on the tip', async () => {
    expect(await keepAwakeWith(undefined)).toBe(false);
    session.discard();
    expect(await keepAwakeWith({ request: async () => { throw new Error('NotAllowedError'); } })).toBe(false);
  });

  test('a granted lock keeps the tip off, and is taken again when it drops while on screen', async () => {
    const listeners: (() => void)[] = [];
    const sentinel = { addEventListener: (_: string, f: () => void) => listeners.push(f), release: async () => {} };
    const request = vi.fn(async () => sentinel);
    expect(await keepAwakeWith({ request })).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    listeners[0]();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    expect(session.wakeLockWorks).toBe(true);
    session.discard();
  });
});

describe('Announcements and spoken labels (A8, A17)', () => {
  test('announce empties the region first, so the same words are read again', () => {
    vi.useFakeTimers();
    const el = { textContent: 'Rest over' as string | null };
    const off = registerLiveRegion(el);
    announce('Rest over');
    expect(el.textContent).toBe('');
    vi.advanceTimersByTime(60);
    expect(el.textContent).toBe('Rest over');
    off();
    announce('ignored');
    vi.advanceTimersByTime(60);
    expect(el.textContent).toBe('Rest over');
  });

  test('stepper values are said once the steps stop', () => {
    vi.useFakeTimers();
    const el = { textContent: '' as string | null };
    const off = registerLiveRegion(el);
    for (const w of [100, 105, 110, 115]) { announceSoon('weight', `Weight ${w} lb`); vi.advanceTimersByTime(100); }
    expect(el.textContent).toBe('');
    vi.advanceTimersByTime(800);
    expect(el.textContent).toBe('Weight 115 lb');
    off();
  });

  test('a stepper value still waiting does not talk over "Set N logged"', () => {
    vi.useFakeTimers();
    const el = { textContent: '' as string | null };
    const off = registerLiveRegion(el);
    announceSoon('weight', 'Weight 250 lb');
    vi.advanceTimersByTime(100);
    announce('Set 1 logged.');
    vi.advanceTimersByTime(2000);
    expect(el.textContent).toBe('Set 1 logged.');
    off();
  });

  test('no "Reps in reps" and no "1 reps left"', () => {
    expect(stepperLabel('Reps', 'reps')).toBe('Reps');
    expect(stepperLabel('Weight', 'lb')).toBe('Weight in lb');
    expect(stepperLabel('Time', 'seconds')).toBe('Time in seconds');
    expect(repsLeftText(1)).toBe('1 rep left');
    expect(repsLeftText(2)).toBe('2 reps left');
    expect(repsLeftText(0)).toBe('no reps left');
    expect(repsLeftText(5)).toBe('4 or more reps left');
  });
});

describe('Rest time per exercise (F3)', () => {
  test('changing it in a workout changes every copy there and is remembered for the next workout', () => {
    session.startPrepared({ startedAt: Date.now(), focus: null, currentIndex: 0,
      exercises: [exercise('a', compound.id), exercise('b', isolation.id, { restSeconds: 75 }), exercise('c', compound.id)] });
    session.setExerciseRest('a', 150);
    expect(session.state!.exercises.map((x) => x.restSeconds)).toEqual([150, 75, 150]);
    expect(app.profile!.exerciseRest![compound.id]).toBe(150);

    session.startPrepared({ startedAt: Date.now(), focus: null, currentIndex: 0, exercises: [exercise('d', compound.id), exercise('e', isolation.id, { restSeconds: 75 })] }, true);
    expect(session.state!.exercises.map((x) => x.restSeconds)).toEqual([150, 75]);
  });

  test('the remembered rest is what the timer runs after a set', () => {
    app.setExerciseRest(compound.id, 45);
    session.startPrepared({ startedAt: Date.now(), focus: null, currentIndex: 0, exercises: [exercise('a', compound.id)] });
    session.logSet(session.state!.exercises[0].sets[0].id, 'a');
    expect(session.restTotal).toBe(45);
  });

  test('added exercises get the generator rest for their kind, or your own', () => {
    const scheme = makeScheme(app.profile!.plan.goal, app.profile!.plan.experience);
    session.startEmpty(true);
    session.addExercise(app.planner().prescribe(compound));
    session.addExercise(app.planner().prescribe(isolation));
    expect(session.state!.exercises.map((x) => x.restSeconds)).toEqual([scheme.restCompound, scheme.restIsolation]);
    app.setExerciseRest(isolation.id, 30);
    session.startEmpty(true);
    session.addExercise(app.planner().prescribe(isolation));
    expect(session.state!.exercises[0].restSeconds).toBe(30);
  });

  test('stretches with no rest keep none', () => {
    const s = { startedAt: 0, focus: null, currentIndex: 0, exercises: [exercise('a', compound.id, { restSeconds: 0 })] };
    applyRestPreferences(s, { [compound.id]: 90 });
    expect(s.exercises[0].restSeconds).toBe(0);
  });

  test('stored rest is read defensively', () => {
    expect(readExerciseRest({ a: 90, b: '60', c: -5, d: 9999, e: NaN, f: 62.4 })).toEqual({ a: 90, f: 62 });
    expect(readExerciseRest(null)).toEqual({});
    expect(readExerciseRest([1, 2])).toEqual({});
  });

  test('rest reads well on buttons and aloud', () => {
    expect([45, 60, 90, 150].map(restLabel)).toEqual(['45 s', '1 min', '1:30', '2:30']);
    expect(restSpoken(90)).toBe('1 minute 30 seconds');
    expect(restSpoken(120)).toBe('2 minutes');
  });
});

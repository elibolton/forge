import {
  type DayFocus, type PlannedWorkout, type ProgramProgress, type ProgramRef, type ProgressionSuggestion,
  type ResolvedPrescription, type ResolvedSession, type WorkoutProgram, Catalog, dayNumber, effortRIR, effortText,
  isPerSide, nextDayID, resolveSession, restText, rxExercise, setsText, suggest, swappedSlot,
} from '../engine';
import { type Profile, app } from './store.svelte';
import { type SessionExercise, type SessionSet, type SessionState, newSet } from './session.svelte';
import { isSameDay } from './units';
import { uuid } from '../engine';

// MARK: - Today's generated workout

/** Today's generated workout, kept until the day ends or a workout is logged, so edits stick. */
export interface TodayPlan {
  generatedAt: number;
  /** Settings fingerprint at generation time; when it drifts, Today offers to rebuild. */
  basis: string;
  /** Logged workouts at generation time; a new one means it's time for the next workout. */
  logCount: number;
  seed: number;
  /** Today-only overrides from the Switch and duration chips. */
  focus: DayFocus | null;
  minutes: number | null;
  workout: PlannedWorkout;
}

/**
 * Today's plan with each exercise at most once (the first copy kept). A plan saved before the Add picker
 * left out exercises already in it can hold one twice, which the keyed list on Today can't show.
 * Returns the same object when there's nothing to drop.
 */
export function withoutDuplicateExercises(t: TodayPlan): TodayPlan {
  const seen = new Set<string>();
  const exercises = t.workout.exercises.filter((p) => !seen.has(p.exercise.id) && !!seen.add(p.exercise.id));
  return exercises.length === t.workout.exercises.length ? t : { ...t, workout: { ...t.workout, exercises } };
}

export const isTodayPlanCurrent = (t: TodayPlan, logCount: number, now = Date.now()) =>
  isSameDay(t.generatedAt, now) && t.logCount === logCount;

/** Everything a generated workout depends on, as a stable string. Preferences are applied in place. */
/** Bump when the workout generator changes how it builds sessions. */
export const GENERATOR_VERSION = 'gen5';

export function planBasis(p: Profile, activities: { id: string }[] = app.activities): string {
  const plan = p.plan;
  const gym = p.gyms.find((g) => g.id === p.activeGymID) ?? p.gyms[0];
  const increments = Object.entries(gym?.increments ?? {}).map(([k, v]) => `${k}=${v}`).sort();
  // Plates and bars only join the key when set, so gyms without them keep their saved plans.
  const plates = gym?.plates ? [`plates:${gym.plates.map((x) => `${x.weight}x${x.pairs ?? ''}`).join(',')}`] : [];
  const bars = gym?.bars ? [`bars:${Object.entries(gym.bars).map(([k, v]) => `${k}=${v}`).sort().join(',')}`] : [];
  const overrides = p.overrides.map((o) => `${o.muscle}=${o.recovery}@${Math.trunc(o.date / 1000)}`).sort();
  return [
    // Bump when the generator changes, so saved plans offer a rebuild.
    GENERATOR_VERSION,
    plan.goal, plan.experience, plan.split, plan.sessionMinutes, plan.variability, plan.warmUpSets, plan.supersets,
    [...plan.injuries].sort().join(','), gym?.id, [...(gym?.equipment ?? [])].sort().join(','), gym?.usesPounds,
    increments.join(','), overrides.join(','), activities.map((a) => a.id).sort().join(','), ...plates, ...bars,
    // Only when there are some, so plans saved before check-ins existed don't all offer a rebuild.
    ...(checkInBasis(p) ? [checkInBasis(p)] : []),
  ].join('|');
}

/** Block check-ins as a stable string: they can stretch a block or bring its deload forward. */
export function checkInBasis(p: Pick<Profile, 'blockCheckIns'>): string {
  const out: string[] = [];
  for (const [start, weeks] of Object.entries(p.blockCheckIns ?? {})) {
    for (const [week, a] of Object.entries(weeks)) {
      const answers = a.skipped ? 'skip' : [a.jointPain, a.stillSore, a.poorSleepOrMotivation, a.stalled].map(Number).join('');
      out.push(`${start}/${week}=${answers}@${Math.trunc(a.answeredAt / 1000)}`);
    }
  }
  return out.sort().join(',');
}

export function buildToday(focus: DayFocus | null, minutes: number | null, seed?: number | null): TodayPlan {
  const resolved = seed ?? dayNumber(Date.now());
  const workout = app.planner(minutes).generate({ now: Date.now(), seed: resolved, focus });
  return {
    generatedAt: Date.now(), basis: planBasis(app.profile!), logCount: app.logs.length, seed: resolved, focus, minutes, workout,
  };
}

// MARK: - Program day

/** Day-of changes to a program day (swaps and skipped exercises). They apply only to that week's day. */
export interface ProgramDayEdits {
  key: string;
  /** Slot id → replacement exercise id. */
  swaps: Record<string, string>;
  removed: string[];
}

export const editsKey = (programID: string, week: number, dayID: string) => `${programID}|${week}|${dayID}`;

export function loadEdits(key: string): ProgramDayEdits {
  const stored = app.get<ProgramDayEdits>('programDayEdits');
  return stored?.key === key ? stored : { key, swaps: {}, removed: [] };
}

export function saveEdits(e: ProgramDayEdits) { app.set('programDayEdits', e); }

/** One exercise of today's program day with its suggestion. */
export interface ProgramDayItem {
  prescription: ResolvedPrescription;
  suggestion: ProgressionSuggestion;
  isSwapped: boolean;
}

/** Working sets the logger will show (per-side work counts each side). */
export const loggedSetCount = (i: ProgramDayItem) => i.prescription.sets * (isPerSide(i.prescription.slot.laterality) ? 2 : 1);

/** Today's program day, resolved and ready to show or start. */
export interface ProgramDayPlan {
  program: WorkoutProgram;
  progress: ProgramProgress;
  session: ResolvedSession;
  items: ProgramDayItem[];
  removed: ResolvedPrescription[];
}

export const dayPlanRef = (p: ProgramDayPlan): ProgramRef =>
  ({ programID: p.program.id, week: p.session.week, dayID: p.session.day.id, isDeload: p.session.rule.isDeload });

export const dayPlanTitle = (p: ProgramDayPlan) => `Week ${p.session.week} · ${p.session.day.title}`;

export function dayPlanMinutes(p: ProgramDayPlan): number {
  const seconds = p.items.reduce((total, item) => {
    const rx = item.prescription;
    const sideRest = isPerSide(rx.slot.laterality) ? rx.sets * (rx.slot.sideRest ?? 0) : 0;
    return total + loggedSetCount(item) * 40 + rx.sets * rx.restSeconds + sideRest + 60;
  }, 0);
  return Math.round(seconds / 60);
}

export function makeDayPlan(program: WorkoutProgram, progress: ProgramProgress, dayID?: string): ProgramDayPlan | undefined {
  const id = dayID ?? nextDayID(progress, program);
  const session = id ? resolveSession(program, id, progress.week, progress.setAdjustments) : undefined;
  if (!id || !session) return undefined;
  const edits = loadEdits(editsKey(program.id, progress.week, id));
  // A swapped slot takes its load step, effort and laterality from the new exercise (re-resolved, so the
  // week table applies to its effort), and starts without the old exercise's range extension.
  const swaps = Object.fromEntries(Object.entries(edits.swaps).filter(([slotID]) => session.exercises.some((p) => p.slot.id === slotID)));
  if (Object.keys(swaps).length) {
    const swappedProgram = { ...program, days: program.days.map((d) => d.id !== id ? d : {
      ...d, exercises: d.exercises.map((slot) => (swaps[slot.id] ? swappedSlot(slot, swaps[slot.id]) : slot)),
    }) };
    const resolved = resolveSession(swappedProgram, id, progress.week, progress.setAdjustments);
    if (resolved) session.exercises = resolved.exercises;
  }
  const gym = app.activeGym;
  const kept = session.exercises.filter((p) => !edits.removed.includes(p.slot.id));
  const items = kept.map((p) => {
    const isSwapped = swaps[p.slot.id] !== undefined;
    const ownProgress = isSwapped ? { ...progress, rangeExtensions: { ...progress.rangeExtensions, [p.slot.id]: 0 } } : progress;
    return {
      prescription: p,
      suggestion: suggest(p, { progress: ownProgress, history: app.records, gym, plan: app.profile!.plan }),
      isSwapped,
    };
  });
  return { program, progress, session, items, removed: session.exercises.filter((p) => edits.removed.includes(p.slot.id)) };
}

/**
 * Logger state for this day. Big-jump range changes ride along on each exercise (`rangeExtension`) and
 * are saved to the program only when the day is logged, so a discarded start changes nothing. A swapped
 * exercise's range never changes the slot's.
 */
export function startDayPlan(plan: ProgramDayPlan): { state: SessionState } {
  const planner = app.planner();
  const exercises = plan.items.map((item): SessionExercise => {
    const p = item.prescription, s = item.suggestion, e = rxExercise(p);
    const rangeExtension = item.isSwapped ? undefined
      : s.action?.type === 'extendRange' ? s.action.by : s.action?.type === 'resetRange' ? null : undefined;
    const sets: SessionSet[] = [];
    const perSide = isPerSide(p.slot.laterality);
    if (s.weight !== null && !perSide) {
      for (const w of planner.warmupSets(s.weight, s.reps, e)) sets.push(newSet(w.weight, w.reps, { isWarmup: true }));
    }
    for (let i = 0; i < p.sets; i++) {
      if (perSide) {
        sets.push(newSet(s.weight, s.reps, { side: 'left' }));
        sets.push(newSet(s.weight, s.reps, { side: 'right' }));
      } else sets.push(newSet(s.weight, s.reps));
    }
    return {
      id: uuid(), exerciseID: e.id, sets, restSeconds: p.restSeconds, targetRIR: effortRIR(p.effort)?.low ?? 0,
      targetReps: s.reps, rir: null, reasons: [s.reason],
      program: {
        slotID: p.slot.id, label: p.slot.label, range: s.range, effort: p.effort, setsText: setsText(p),
        effortText: effortText(p.effort), restText: restText(p), notes: [...p.slot.notes, ...(p.weekNote ? [p.weekNote] : [])],
        lastSetNote: p.lastSetNote, laterality: p.slot.laterality, sideRest: p.slot.sideRest,
        supersetGroup: p.slot.supersetGroup, supersetRestBetween: p.supersetRestBetween, isOptional: p.slot.isOptional,
        suggestionReason: s.reason, ...(rangeExtension !== undefined ? { rangeExtension } : {}),
      },
    };
  });
  return {
    state: { startedAt: Date.now(), focus: plan.session.day.focus, exercises, currentIndex: 0, program: dayPlanRef(plan), title: dayPlanTitle(plan) },
  };
}

export { Catalog };

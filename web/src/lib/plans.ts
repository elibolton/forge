import {
  type DayFocus, type PlannedWorkout, type ProgramProgress, type ProgramRef, type ProgressionSuggestion,
  type ResolvedPrescription, type ResolvedSession, type WorkoutProgram, Catalog, dayNumber, effortRIR, effortText,
  isPerSide, nextDayID, resolveSession, restText, rxExercise, setsText, suggest,
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

export const isTodayPlanCurrent = (t: TodayPlan, logCount: number, now = Date.now()) =>
  isSameDay(t.generatedAt, now) && t.logCount === logCount;

/** Everything a generated workout depends on, as a stable string. Preferences are applied in place. */
export function planBasis(p: Profile): string {
  const plan = p.plan;
  const gym = p.gyms.find((g) => g.id === p.activeGymID) ?? p.gyms[0];
  const increments = Object.entries(gym?.increments ?? {}).map(([k, v]) => `${k}=${v}`).sort();
  const overrides = p.overrides.map((o) => `${o.muscle}=${o.recovery}@${Math.trunc(o.date / 1000)}`).sort();
  return [
    plan.goal, plan.experience, plan.split, plan.sessionMinutes, plan.variability, plan.warmUpSets, plan.supersets,
    [...plan.injuries].sort().join(','), gym?.id, [...(gym?.equipment ?? [])].sort().join(','), gym?.usesPounds,
    increments.join(','), overrides.join(','), p.activities.map((a) => a.id).sort().join(','),
  ].join('|');
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
  session.exercises = session.exercises.map((p) =>
    edits.swaps[p.slot.id] ? { ...p, slot: { ...p.slot, exerciseID: edits.swaps[p.slot.id] } } : p);
  const gym = app.activeGym;
  const kept = session.exercises.filter((p) => !edits.removed.includes(p.slot.id));
  const items = kept.map((p) => ({
    prescription: p,
    suggestion: suggest(p, { progress, history: app.records, gym, plan: app.profile!.plan }),
    isSwapped: edits.swaps[p.slot.id] !== undefined,
  }));
  return { program, progress, session, items, removed: session.exercises.filter((p) => edits.removed.includes(p.slot.id)) };
}

/** Logger state for this day, and the progress with big-jump range changes applied. */
export function startDayPlan(plan: ProgramDayPlan): { state: SessionState; progress: ProgramProgress } {
  const progress = structuredClone(plan.progress);
  const planner = app.planner();
  const exercises = plan.items.map((item): SessionExercise => {
    const p = item.prescription, s = item.suggestion, e = rxExercise(p);
    if (s.action?.type === 'extendRange') progress.rangeExtensions[p.slot.id] = s.action.by;
    if (s.action?.type === 'resetRange') delete progress.rangeExtensions[p.slot.id];
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
        suggestionReason: s.reason,
      },
    };
  });
  return {
    state: { startedAt: Date.now(), focus: plan.session.day.focus, exercises, currentIndex: 0, program: dayPlanRef(plan), title: dayPlanTitle(plan) },
    progress,
  };
}

export { Catalog };

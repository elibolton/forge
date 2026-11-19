import { type RepRange, repRange } from './models';
import {
  type Effort, type ExerciseClass, type ExercisePrescription, type Laterality, type LoadStep, type PrescriptionOverride,
  type WorkoutProgram, rirTarget, weekRule,
} from './program';

// Program 1: 8-week, 5-day Push / Pull / Legs / Upper / Lower hypertrophy block for a home gym
// (barbell, EZ bar, dumbbells, bench, rack, dip station, lat pulldown + low row).

interface RxOpts {
  label?: string; rest: [number, number]; sideRest?: number; laterality?: Laterality; step: LoadStep;
  optional?: boolean; superset?: string; notes?: string[]; lastSet?: string; overrides?: Record<number, PrescriptionOverride>;
}

function rx(id: string, exerciseID: string, sets: number, reps: RepRange, effort: Effort, kind: ExerciseClass,
            o: RxOpts): ExercisePrescription {
  return {
    id, exerciseID, label: o.label, sets, reps, effort, kind, rest: o.rest, sideRest: o.sideRest,
    laterality: o.laterality ?? 'bilateral', loadStep: o.step, isOptional: o.optional ?? false, supersetGroup: o.superset,
    notes: o.notes ?? [], lastSetNote: o.lastSet, weekOverrides: o.overrides ?? {},
  };
}
const r = repRange;
const rir = (a: number, b?: number): Effort => ({ type: 'rir', rir: rirTarget(a, b) });
const ecc: Effort = { type: 'eccentricOnly' };
const partials = 'Lengthened partials on the last set';

const pplul8: WorkoutProgram = (() => {
  const push = {
    id: 'push', title: 'Push', focus: 'push' as const, supersets: [], exercises: [
      rx('push.1', 'bb-bench', 3, r(5, 8), rir(1, 2), 'compound', { rest: [180, 240], step: 'upperBarbell',
        notes: ['Safeties set just below chest height', 'Touch the lower sternum'] }),
      rx('push.2', 'db-incline-bench', 3, r(8, 12), rir(1, 2), 'compound', { rest: [150, 180], step: 'dumbbell',
        notes: ['Bench at 30°', 'Upper arms slightly below the torso at the bottom'] }),
      rx('push.3', 'db-fly', 2, r(10, 15), rir(0, 1), 'isolation', { rest: [120, 120], step: 'dumbbell',
        notes: ['Deep stretch, fixed ~15–20° elbow bend', 'Stop ~30° short of vertical at the top'], lastSet: partials }),
      rx('push.4', 'cable-lateral-raise', 5, r(10, 15), rir(0, 1), 'isolation', { rest: [60, 90], laterality: 'perArm', step: 'cablePin',
        notes: ['Single arm, low pulley, cable crossing in front of the body', 'Raise slightly in front of the torso'] }),
      rx('push.5', 'cable-overhead-tricep-ext', 3, r(10, 15), rir(0, 1), 'isolation', { rest: [90, 120], step: 'cablePin',
        notes: ['Rope on the high pulley, facing away', 'Upper arms by the ears, deep stretch'] }),
    ],
  };

  const pull = {
    id: 'pull', title: 'Pull', focus: 'pull' as const, supersets: [], exercises: [
      rx('pull.1', 'lat-pulldown', 4, r(6, 10), rir(1, 2), 'compound', { rest: [150, 180], step: 'cablePin',
        notes: ['Full stretch at the top', 'Bar to the upper chest'] }),
      rx('pull.2', 'incline-db-row', 3, r(8, 12), rir(1), 'compound', { rest: [120, 150], step: 'dumbbell',
        notes: ['Chest supported on the incline bench', 'Full protraction at the bottom'] }),
      rx('pull.3', 'cable-row', 3, r(10, 12), rir(1), 'compound', { rest: [120, 120], step: 'cablePin',
        notes: ['V-bar', 'Reach and lean 10–15° forward at the stretch', 'Elbows to your back pockets'] }),
      rx('pull.4', 'face-pull', 3, r(12, 15), rir(0, 1), 'isolation', { rest: [90, 90], step: 'cablePin',
        notes: ['Rope', 'Pull to the forehead, elbows high, thumbs back'] }),
      rx('pull.5', 'incline-db-curl', 3, r(8, 12), rir(0, 1), 'isolation', { rest: [90, 120], step: 'dumbbell',
        notes: ['Bench at 45–60°', 'Arms hang behind the torso'], lastSet: partials }),
      rx('pull.6', 'cable-rope-hammer-curl', 2, r(10, 15), rir(0, 1), 'isolation', { rest: [60, 90], step: 'cablePin',
        optional: true, notes: ['Rope on the low pulley'] }),
    ],
  };

  const legs = {
    id: 'legs', title: 'Legs', focus: 'legs' as const, supersets: [], exercises: [
      rx('legs.1', 'bb-squat', 4, r(5, 8), rir(2), 'compound', { rest: [180, 240], step: 'lowerBodyBarbell',
        notes: ['High bar, full depth', 'Safeties set'] }),
      rx('legs.2', 'bulgarian-split-squat', 3, r(8, 12), rir(1, 2), 'compound', { rest: [120, 120], sideRest: 60, laterality: 'perLeg',
        step: 'dumbbell' }),
      rx('legs.3', 'nordic-curl', 3, r(4, 8), ecc, 'isolation', { rest: [120, 180], step: 'bodyweight',
        notes: ['Lowering reps only: end each set when you lose control of the descent',
          'Anchor your heels under a loaded bar or the rack'],
        overrides: { 1: { sets: 2, reps: r(3, 5), note: 'Week 1: 2 × 3–5 only' },
          8: { sets: 1, reps: r(3, 3), note: 'Deload: 1 × 3 at most' } } }),
      rx('legs.4', 'single-leg-db-calf-raise', 4, r(8, 12), rir(0, 1), 'isolation', { rest: [60, 90], laterality: 'perLeg', step: 'dumbbell',
        notes: ['2 s pause at the bottom'], lastSet: partials }),
    ],
  };

  const upper = {
    id: 'upper', title: 'Upper', focus: 'upper' as const, exercises: [
      rx('upper.1', 'bb-incline-bench', 3, r(6, 10), rir(1, 2), 'compound', { rest: [180, 180], step: 'upperBarbell',
        notes: ['Bench at 30°'] }),
      rx('upper.2', 'weighted-dip', 2, r(6, 12), rir(1, 2), 'compound', { rest: [150, 180], step: 'dumbbell',
        notes: ['Lean forward 20–30°', 'Only as deep as is pain-free'] }),
      rx('upper.3', 'single-arm-lat-pulldown', 3, r(10, 12), rir(1), 'compound', { rest: [60, 60], sideRest: 60, laterality: 'perArm',
        step: 'cablePin', notes: ['Half-kneeling, D-handle'] }),
      rx('upper.4', 'wide-grip-cable-row', 3, r(10, 12), rir(1), 'compound', { rest: [120, 120], step: 'cablePin',
        notes: ['Straight bar', 'Elbows flared 60–75°'] }),
      rx('upper.5', 'leaning-db-lateral-raise', 5, r(12, 20), rir(0, 1), 'isolation', { rest: [60, 90], laterality: 'perArm', step: 'dumbbell',
        notes: ['Lean away holding the rack upright'], lastSet: partials }),
      rx('upper.6a', 'ez-preacher-curl', 3, r(8, 12), rir(0, 1), 'isolation', { label: '6a', rest: [90, 90], step: 'upperBarbell',
        superset: '6', notes: ['Arms over the incline backrest'] }),
      rx('upper.6b', 'skull-crusher', 3, r(8, 12), rir(1), 'isolation', { label: '6b', rest: [120, 120], step: 'upperBarbell',
        superset: '6', notes: ['Lower the bar behind your head'], lastSet: '0 RIR on the last set' }),
    ],
    supersets: [{ group: '6', restBetween: [60, 90] as [number, number], restAfter: 120 }],
  };

  const lower = {
    id: 'lower', title: 'Lower', focus: 'lower' as const, supersets: [], exercises: [
      rx('lower.1', 'bb-rdl', 4, r(6, 10), rir(2), 'compound', { rest: [180, 180], step: 'lowerBodyBarbell',
        notes: ['Straps are fine'] }),
      rx('lower.2', 'bb-front-squat', 3, r(8, 12), rir(1, 2), 'compound', { rest: [150, 180], step: 'lowerBodyBarbell',
        notes: ['Heels elevated on plates or a wedge'] }),
      rx('lower.3', 'prone-db-leg-curl', 3, r(10, 15), rir(0, 1), 'isolation', { rest: [90, 90], step: 'dumbbell',
        notes: ['Chest on a ~30° incline backrest, knees off the seat', 'Dumbbell between your feet'] }),
      rx('lower.4', 'sissy-squat', 3, r(8, 15), rir(1), 'isolation', { rest: [90, 90], step: 'upperBarbell',
        notes: ['Hold the rack with one hand, a plate on your chest'] }),
      rx('lower.5', 'seated-db-calf-raise', 3, r(12, 20), rir(0, 1), 'isolation', { rest: [60, 60], step: 'dumbbell' }),
      rx('lower.6', 'bb-calf-raise', 3, r(12, 20), rir(0, 1), 'isolation', { rest: [60, 60], step: 'upperBarbell',
        notes: ['Bottom-half (lengthened) partials only'] }),
    ],
  };

  const late = (w: number) => weekRule(w, {
    compoundRIR: rirTarget(1), isolationRIR: rirTarget(0),
    rirExceptions: { 'bb-squat': rirTarget(1, 2), 'bb-rdl': rirTarget(1, 2) },
    isolationLastSetNote: '0 RIR, then lengthened partials on the last set',
  });

  return {
    id: 'pplul-8wk-home',
    name: '8-Week Push/Pull/Legs/Upper/Lower',
    summary: '5 days a week, hypertrophy, home gym. Long-length training, 10–20 weekly sets per muscle, RIR that drops week by week, and a deload in week 8.',
    weeks: 8,
    schedule: ['push', 'pull', 'legs', null, 'upper', 'lower', null],
    days: [push, pull, legs, upper, lower],
    weekRules: [
      weekRule(1, { compoundRIR: rirTarget(3), isolationRIR: rirTarget(2), calibrate: true,
        notes: ['Take the last set of one isolation per session to true failure, to calibrate your RIR.'] }),
      weekRule(2, { compoundRIR: rirTarget(2), isolationRIR: rirTarget(1) }),
      weekRule(3),
      weekRule(4, { notes: ['Optional: +1 set for 1–2 lagging muscles if you have no fatigue flags.'] }),
      late(5), late(6), late(7),
      weekRule(8, { compoundRIR: rirTarget(3, 4), isolationRIR: rirTarget(3, 4), sets: 'halved', isDeload: true,
        notes: ['Deload: same exercises, about half the sets.', 'Same loads or up to 10% lighter. No failure, no partials.'] }),
    ],
    progressionNotes: [
      'Start with the load that puts set 1 at the bottom of the range at the target RIR.',
      'Add reps first, week to week.',
      'Add load once every working set reaches the top of the range: squat/RDL +5 kg (10 lb), presses and rows +2.5 kg (5 lb), dumbbells the next pair, cables the next pin.',
      "If that jump is over ~10% of the load, extend the range by 3–5 reps first.",
      'No progress for 2 weeks in a row: cut that exercise by one set.',
    ],
  };
})();

/** Built-in programs. To add one, define it here and list it in `all`. */
export const Programs = {
  pplul8,
  all: [pplul8] as WorkoutProgram[],
  byID(id: string): WorkoutProgram | undefined { return Programs.all.find((p) => p.id === id); },
};

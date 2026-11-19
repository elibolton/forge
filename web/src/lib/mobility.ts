import { Catalog, type Exercise, type Muscle, uuid } from '../engine';
import { type SessionExercise, type SessionState, newSet } from './session.svelte';

export type MobilityStage = 'warmup' | 'cooldown';

/** Moving drills to raise the temperature before lifting. */
const WARMUP = ['arm-circle-forward', 'arm-circle-backward', 'cat-cow', 'hip-hinge-drill', 'inchworm', 'butt-kick', 'high-knee', 'prone-hip-circle', 'fan-stretch'];
/** Held stretches for after. */
const COOLDOWN = ['doorway-chest-stretch', 'chest-expansion', 'tricep-stretch', 'crab-pose', 'chin-drop', 'downward-dog', 'seated-forward-bend',
  'knee-to-chest', 'shin-box', 'lateral-lunge-stretch', 'prone-calf-stretch', 'wall-pec-stretch', 'reach-behind-open', 'standing-forward-bend', 'head-tilt'];

/**
 * The drills or stretches that best match today's muscles: most overlap first, then catalog order,
 * topped up with general ones so there are always `count`.
 */
export function pickMobility(targets: Muscle[], stage: MobilityStage, count = 3): Exercise[] {
  const ids = stage === 'warmup' ? WARMUP : COOLDOWN;
  const score = (e: Exercise) => e.primary.filter((m) => targets.includes(m)).length * 2 + e.secondary.filter((m) => targets.includes(m)).length;
  return ids
    .map((id, order) => ({ e: Catalog.exercise(id), order }))
    .sort((a, b) => score(b.e) - score(a.e) || a.order - b.order)
    .slice(0, count)
    .map((x) => x.e);
}

function mobilityExercise(e: Exercise, stage: MobilityStage): SessionExercise {
  // Drills: 10 reps (or 30 s). Stretches: a 30 s hold.
  const set = newSet(null, e.isTimed || stage === 'cooldown' ? 30 : 10);
  return {
    id: uuid(), exerciseID: e.id, sets: [set], restSeconds: 0, targetRIR: 0, targetReps: set.reps, rir: null,
    reasons: [stage === 'warmup' ? 'Warm-up' : 'Cool-down'],
  };
}

/** Adds warm-up drills before and cool-down stretches after, as your settings ask. Mutates `state`. */
export function addMobility(state: SessionState, targets: Muscle[], prefs: { warmup: boolean; cooldown: boolean }) {
  if (prefs.warmup) state.exercises.unshift(...pickMobility(targets, 'warmup').map((e) => mobilityExercise(e, 'warmup')));
  if (prefs.cooldown) state.exercises.push(...pickMobility(targets, 'cooldown').map((e) => mobilityExercise(e, 'cooldown')));
}

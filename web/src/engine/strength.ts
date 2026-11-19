import { DAY_MS, type LoggedSet, type WorkoutRecord, workingSets, roundLoad } from './models';

/**
 * Epley estimate, counting reps left in the tank as reps done. A missing `rir` counts as 0 here, which
 * keeps personal records conservative; planning goes through `setRIR` first.
 */
export function oneRM(weight: number, reps: number, rir?: number | null): number {
  const effective = Math.min(reps + (rir ?? 0), 15);
  if (effective <= 1) return weight;
  return weight * (1 + effective / 30);
}

/** Inverse Epley: the load that leaves `rir` reps in reserve after `reps`. */
export function weightForReps(reps: number, rir: number, oneRMValue: number): number {
  const effective = reps + rir;
  if (effective <= 1) return oneRMValue;
  return oneRMValue / (1 + effective / 30);
}

/** Reps in reserve assumed for a set nobody rated: the usual prescription (recovery assumes the same). */
export const UNRATED_RIR = 2;

/**
 * Reps in reserve a logged set most likely had, for planning: its rating, else 0 for a set marked as
 * taken to failure, else what was prescribed, else `UNRATED_RIR`. Rating is optional in the logger,
 * so an unrated set mustn't read as a set to failure (that underestimates the max and drops loads).
 */
export function setRIR(set: Pick<LoggedSet, 'rir' | 'type'>, targetRIR?: number | null): number {
  if (set.rir != null && Number.isFinite(set.rir)) return Math.max(0, set.rir);
  if (set.type === 'failure') return 0;
  if (targetRIR != null && Number.isFinite(targetRIR)) return Math.min(5, Math.max(0, targetRIR));
  return UNRATED_RIR;
}

/** Heaviest believable logged load in kg; typos and corrupt imports (Infinity, 1e9) are ignored. */
export const MAX_PLAUSIBLE_KG = 1000;
export const plausibleLoad = (kg: number): boolean => Number.isFinite(kg) && kg > 0 && kg <= MAX_PLAUSIBLE_KG;

/** Best recent e1RM, discounted for time away (no discount for 14 days, then 0.5%/day down to 80%). */
export function estimatedOneRM(exerciseID: string, history: WorkoutRecord[], now: number): number | undefined {
  let best: number | undefined;
  for (const record of history) {
    const days = (now - record.date) / DAY_MS;
    if (days < 0 || days > 120) continue;
    const factor = days <= 14 ? 1 : Math.max(0.8, 1 - 0.005 * (days - 14));
    for (const logged of record.exercises) {
      if (logged.exerciseID !== exerciseID) continue;
      for (const set of workingSets(logged)) {
        if (!plausibleLoad(set.weight)) continue;
        const value = oneRM(set.weight, set.reps, setRIR(set, logged.targetRIR)) * factor;
        if (value > (best ?? 0)) best = value;
      }
    }
  }
  return best;
}

/** Best reps (or seconds) in a single set over the last 60 days, for bodyweight work. */
export function bestReps(exerciseID: string, history: WorkoutRecord[], now: number): number | undefined {
  let best: number | undefined;
  for (const r of history) {
    const age = now - r.date;
    if (age < 0 || age > 60 * DAY_MS) continue;
    for (const l of r.exercises) {
      if (l.exerciseID !== exerciseID) continue;
      for (const s of workingSets(l)) if (Number.isFinite(s.reps) && (best === undefined || s.reps > best)) best = s.reps;
    }
  }
  return best;
}

export const Strength = { oneRM, weightForReps, estimatedOneRM, bestReps, setRIR, round: roundLoad };

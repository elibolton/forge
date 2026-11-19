import { DAY_MS, type WorkoutRecord, workingSets, roundLoad } from './models';

/** Epley estimate, counting reps left in the tank as reps done. */
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
        if (set.weight <= 0) continue;
        const value = oneRM(set.weight, set.reps, set.rir) * factor;
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
    if (now - r.date > 60 * DAY_MS) continue;
    for (const l of r.exercises) {
      if (l.exerciseID !== exerciseID) continue;
      for (const s of workingSets(l)) if (best === undefined || s.reps > best) best = s.reps;
    }
  }
  return best;
}

export const Strength = { oneRM, weightForReps, estimatedOneRM, bestReps, round: roundLoad };

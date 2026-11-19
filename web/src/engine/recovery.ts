import { Catalog } from './catalog';
import {
  MUSCLES, type Exercise, type ExternalActivity, type Muscle, type MuscleMap, type RecoveryOverride,
  type WorkoutRecord, workingSets,
} from './models';

const SET_DOSE = 0.12;
const SECONDARY_WEIGHT = 0.5;

/** Sets closer to failure fatigue more. Unlogged RiR is treated as 2. */
export function effortFactor(rir?: number | null): number {
  const r = rir ?? 2;
  if (r <= 0) return 1.2;
  if (r === 1) return 1.1;
  if (r === 2) return 1.0;
  if (r === 3) return 0.85;
  return 0.7;
}

/**
 * Per-muscle recovery, 0 (wrecked) to 1 (fresh). Light sessions clear in about two days, a muscle hit
 * to saturation takes seven. Manual overrides replace earlier history.
 */
export function computeRecovery(args: {
  history: WorkoutRecord[];
  external?: ExternalActivity[];
  overrides?: RecoveryOverride[];
  catalog?: Map<string, Exercise>;
  now: number;
}): Record<Muscle, number> {
  const { history, external = [], overrides = [], now } = args;
  const catalog = args.catalog ?? Catalog.byID;
  const latest = new Map<Muscle, RecoveryOverride>();
  for (const o of overrides) {
    const cur = latest.get(o.muscle);
    if (!cur || o.date > cur.date) latest.set(o.muscle, o);
  }
  const fatigue = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;

  const add = (muscle: Muscle, dose: number, date: number, maxWindowHours = 168) => {
    const o = latest.get(muscle);
    if (o && date < o.date) return;
    const hours = (now - date) / 3_600_000;
    if (hours < 0) return;
    const amount = Math.min(1, dose);
    const window = Math.min(maxWindowHours, 48 + 120 * amount);
    fatigue[muscle] += amount * Math.max(0, 1 - hours / window);
  };

  for (const record of history) {
    const doses: MuscleMap = {};
    for (const logged of record.exercises) {
      const exercise = catalog.get(logged.exerciseID);
      if (!exercise || exercise.pattern === 'mobility') continue;
      for (const set of workingSets(logged)) {
        const dose = SET_DOSE * effortFactor(set.rir);
        for (const m of exercise.primary) doses[m] = (doses[m] ?? 0) + dose;
        for (const m of exercise.secondary) doses[m] = (doses[m] ?? 0) + dose * SECONDARY_WEIGHT;
      }
    }
    for (const [m, dose] of Object.entries(doses) as [Muscle, number][]) add(m, dose, record.date);
  }

  for (const a of external) {
    for (const m of a.muscles) add(m, Math.min(0.6, a.minutes / 100), a.date, 48);
  }

  for (const [m, o] of latest) add(m, 1 - o.recovery, o.date);

  const out = {} as Record<Muscle, number>;
  for (const m of MUSCLES) out[m] = Math.max(0, Math.min(1, 1 - fatigue[m]));
  return out;
}

export type RecoveryStatus = 'fresh' | 'recovering' | 'fatigued';

export function recoveryStatus(value: number): RecoveryStatus {
  return value >= 0.8 ? 'fresh' : value >= 0.5 ? 'recovering' : 'fatigued';
}

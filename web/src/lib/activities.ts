import type { ExternalActivity, Muscle } from '../engine';

/** Cardio and sport sessions you log alongside lifting. They tire muscles, so recovery accounts for them. */
export const ACTIVITY_KINDS = ['run', 'walk', 'ride', 'row', 'swim', 'sport', 'other'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface Activity {
  id: string;
  kind: ActivityKind;
  /** Start time, epoch ms. */
  date: number;
  minutes: number;
}

export const activityTitle: Record<ActivityKind, string> = {
  run: 'Run', walk: 'Walk / Hike', ride: 'Ride', row: 'Row', swim: 'Swim', sport: 'Sport', other: 'Other cardio',
};

const LEGS: Muscle[] = ['quads', 'hamstrings', 'glutes', 'calves'];

/** Muscles each kind of activity loads. */
export const activityMuscles: Record<ActivityKind, Muscle[]> = {
  run: LEGS,
  walk: ['quads', 'glutes', 'calves'],
  ride: ['quads', 'glutes', 'calves'],
  row: ['lats', 'upperBack', 'quads', 'hamstrings', 'glutes'],
  swim: ['lats', 'shoulders', 'upperBack', 'triceps'],
  sport: [...LEGS, 'shoulders'],
  other: [],
};

/** Walks are easy on the legs: count them at half. */
const intensity: Record<ActivityKind, number> = { run: 1, walk: 0.5, ride: 0.8, row: 1, swim: 0.9, sport: 1, other: 0 };

/** What the recovery model needs. */
export function toExternal(activities: Activity[]): ExternalActivity[] {
  return activities
    .filter((a) => activityMuscles[a.kind].length && intensity[a.kind] > 0)
    .map((a) => ({ date: a.date, minutes: a.minutes * intensity[a.kind], muscles: activityMuscles[a.kind] }));
}

export function readActivity(v: unknown): Activity | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.date !== 'number' || typeof o.minutes !== 'number' || o.minutes <= 0) return undefined;
  const kind = (ACTIVITY_KINDS as readonly unknown[]).includes(o.kind) ? (o.kind as ActivityKind) : 'other';
  return { id: o.id, kind, date: o.date, minutes: o.minutes };
}

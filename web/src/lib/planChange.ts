// Which settings changed since today's workout was built, in words, so Today can say "Injuries changed"
// rather than "your plan changed". Reads the profile only; `planBasis` (lib/plans.ts) stays the
// fingerprint that decides whether anything changed at all.
import type { Profile } from './store.svelte';

export type PlanParts = Record<string, string>;

/** Labelled pieces of what a generated workout depends on. */
export function planParts(p: Profile, activities: { id: string }[] = []): PlanParts {
  const plan = p.plan;
  const gym = p.gyms.find((g) => g.id === p.activeGymID) ?? p.gyms[0];
  const sorted = (xs: string[]) => [...xs].sort().join(',');
  return {
    Goal: plan.goal,
    Experience: plan.experience,
    Split: plan.split,
    'Session length': String(plan.sessionMinutes),
    'Workout style': plan.variability,
    'Warm-up sets': String(plan.warmUpSets),
    Supersets: String(plan.supersets),
    Injuries: sorted(plan.injuries),
    Gym: gym?.id ?? '',
    Equipment: sorted(gym?.equipment ?? []),
    Units: String(gym?.usesPounds),
    'Weight steps': sorted(Object.entries(gym?.increments ?? {}).map(([k, v]) => `${k}=${v}`)),
    'Plates and bars': JSON.stringify([gym?.plates ?? null, gym?.bars ?? null]),
    'Muscle recovery': sorted(p.overrides.map((o) => `${o.muscle}=${o.recovery}@${o.date}`)),
    'Cardio and activities': sorted(activities.map((a) => a.id)),
    'Block check-in': JSON.stringify(p.blockCheckIns ?? {}),
  };
}

/** The labels whose value differs, in a stable order. */
export function changedParts(before: PlanParts | undefined, now: PlanParts): string[] {
  if (!before) return [];
  const changed = Object.keys(now).filter((k) => before[k] !== now[k]);
  // Another gym brings its own equipment, units and plates: "Gym changed" says it all.
  const gymOwned = ['Equipment', 'Units', 'Weight steps', 'Plates and bars'];
  return changed.includes('Gym') ? changed.filter((k) => !gymOwned.includes(k)) : changed;
}

/** "Injuries changed", "Injuries and equipment changed", or a general line when it can't tell. */
export function changeText(labels: string[]): string {
  if (!labels.length) return 'Your settings changed';
  const words = labels.slice(0, 3).map((l, i) => (i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1)));
  const more = labels.length > 3 ? [`${labels.length - 3} more`] : [];
  const all = [...words, ...more];
  const list = all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}` : all[0];
  return `${list} changed`;
}

/** The parts saved with today's plan, keyed by when the plan was built so a stale copy is never compared. */
export interface SavedParts { generatedAt: number; parts: PlanParts }

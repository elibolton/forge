// Which weight steps a gym's settings offer, and the values a step can take.
import { BAR_KINDS, type BarKind, Catalog, type Exercise, type Gym, LOAD_KINDS, type LoadKind, gymHas, isPlateLoaded, loadEquipment } from '../engine';

/**
 * Every kind of load some exercise this gym can do is rounded to, in settings order. Built from the
 * exercises themselves, so an EZ bar, trap bar, Smith machine or leg press gets its own step (each is
 * read separately when weights are rounded) rather than hiding behind a "Barbell" row.
 */
export function gymLoadKinds(gym: Gym, catalog: Exercise[] = Catalog.all): LoadKind[] {
  const used = new Set<LoadKind>();
  for (const e of catalog) {
    const kind = loadEquipment(e);
    if (kind && !used.has(kind) && gymHas(gym, e)) used.add(kind);
  }
  return LOAD_KINDS.filter((k) => used.has(k));
}

/** Steps the settings move through: real plate, dumbbell and stack jumps, 1.25 kg microplates included. */
export const STEP_VALUES = { kg: [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10], lb: [1, 2, 2.5, 5, 10, 15, 20] };

/** The next step up (+1) or down (−1) from `current`, or undefined at the end of the list. */
export function nextStep(current: number, by: 1 | -1, pounds: boolean): number | undefined {
  const values = pounds ? STEP_VALUES.lb : STEP_VALUES.kg;
  return by > 0 ? values.find((v) => v > current + 1e-9) : [...values].reverse().find((v) => v < current - 1e-9);
}

/** Plate sizes offered as chips in a gym's settings, heaviest first. */
export const PLATE_CHOICES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5], lb: [45, 35, 25, 10, 5, 2.5, 1.25] };

/** Bars a gym's settings ask the weight of: those its equipment includes. */
export function gymBarKinds(gym: Gym): BarKind[] {
  return BAR_KINDS.filter((k) => gym.equipment.includes(k));
}

/** Whether anything at this gym is loaded with plates, so the plate list matters. */
export function usesPlates(gym: Gym, catalog: Exercise[] = Catalog.all): boolean {
  return gymLoadKinds(gym, catalog).some(isPlateLoaded);
}

/**
 * Reads a typed weight or count: blank means "not set" (null); anything unusable is undefined, so
 * the field can put the old value back.
 */
export function readAmount(text: string, max: number, whole = false): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > max) return undefined;
  return whole && !Number.isInteger(n) ? undefined : n;
}

import { type Exercise, baseLoad, baseLoadPounds, loadEquipment } from '../engine';

export const PLATES_LB = [45, 35, 25, 10, 5, 2.5];
export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Bar weight in display units for barbell-style lifts, or undefined when plates don't apply. */
export function barFor(e: Exercise, pounds: boolean): number | undefined {
  const eq = loadEquipment(e);
  if (eq !== 'barbell' && eq !== 'trapBar' && eq !== 'ezBar') return undefined;
  return pounds ? baseLoadPounds(eq) : baseLoad(eq);
}

/**
 * Plates for one side, heaviest first, to load `total` on a bar of `bar` (both in display units).
 * `remainder` is what's left per side when the plates can't make the exact weight.
 */
export function platesPerSide(total: number, bar: number, pounds: boolean): { plates: number[]; remainder: number } {
  let side = Math.max(0, (total - bar) / 2);
  const plates: number[] = [];
  for (const p of pounds ? PLATES_LB : PLATES_KG) {
    while (side >= p - 1e-6) { plates.push(p); side -= p; }
  }
  return { plates, remainder: Math.round(side * 100) / 100 };
}

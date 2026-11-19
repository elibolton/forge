import {
  type Exercise, type Gym, type PlateStock, STANDARD_PLATES, baseLoad, baseLoadPounds, gymBar, gymPlates, loadEquipment,
  platesPerSide as perSide,
} from '../engine';

export const PLATES_LB = STANDARD_PLATES.lb;
export const PLATES_KG = STANDARD_PLATES.kg;

/** What a plate breakdown is worked out from, in display units. */
export interface PlateSetup { bar: number; plates: PlateStock[] }

const standard = (pounds: boolean): PlateStock[] => (pounds ? PLATES_LB : PLATES_KG).map((weight) => ({ weight }));

/**
 * The bar and plates for an exercise at this gym, in display units, or undefined when plates don't apply.
 * A Smith machine shows plates only once the gym gives its starting weight. If the gym is in the other
 * unit its plates and bars can't be used as they are, so the standard ones stand in.
 */
export function plateSetup(e: Exercise, gym: Gym | undefined, pounds: boolean): PlateSetup | undefined {
  const eq = loadEquipment(e);
  const own = gym && gym.usesPounds === pounds ? gym : undefined;
  if (eq === 'smithMachine') {
    const start = own?.bars?.smithMachine;
    return own && start !== undefined ? { bar: start, plates: gymPlates(own) } : undefined;
  }
  if (eq !== 'barbell' && eq !== 'trapBar' && eq !== 'ezBar') return undefined;
  if (own) return { bar: gymBar(own, eq), plates: gymPlates(own) };
  return { bar: pounds ? baseLoadPounds(eq) : baseLoad(eq), plates: standard(pounds) };
}

/** Bar weight in display units for barbell-style lifts, or undefined when plates don't apply. */
export function barFor(e: Exercise, pounds: boolean, gym?: Gym): number | undefined {
  return plateSetup(e, gym, pounds)?.bar;
}

/**
 * Plates for one side, heaviest first, to load `total` on a bar of `bar` (both in display units).
 * `remainder` is what's left per side when the plates can't make the exact weight. Without a plate
 * list it uses the standard set in that unit.
 */
export function platesPerSide(total: number, bar: number, pounds: boolean, plates?: readonly PlateStock[]): { plates: number[]; remainder: number } {
  return perSide(total, bar, plates ?? standard(pounds));
}

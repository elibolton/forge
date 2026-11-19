import { Catalog, type Gym, gymHas } from '../engine';

/**
 * Whether a gym has any way to train the back (a bar, band, cable or weight to pull or row). Without
 * one, pull days and the back half of upper days come up nearly empty, so onboarding says so.
 */
export const canPull = (gym: Gym): boolean =>
  Catalog.builtIn.some((e) => (e.pattern === 'horizontalPull' || e.pattern === 'verticalPull') && gymHas(gym, e));

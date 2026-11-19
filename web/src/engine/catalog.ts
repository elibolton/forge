import { CUSTOM_PREFIX, type Equipment, type Exercise, type Muscle, isBodyweight, loadEquipment } from './models';
import * as data from './catalogData';

/** Exercises shipped with the app. */
const builtIn: Exercise[] = [
  ...data.chest, ...data.shoulders, ...data.arms, ...data.back, ...data.legs, ...data.core, ...data.mobility, ...data.homeGym,
];

let custom: Exercise[] = [];
let all: Exercise[] = builtIn;
let byID: Map<string, Exercise> = index(builtIn);

function index(list: Exercise[]): Map<string, Exercise> {
  const m = new Map<string, Exercise>();
  for (const e of list) if (!m.has(e.id)) m.set(e.id, e);
  return m;
}

export function placeholderName(id: string): string {
  return id.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export const Catalog = {
  builtIn,
  customPrefix: CUSTOM_PREFIX,
  /** Built-in plus the user's custom exercises. */
  get all() { return all; },
  get byID() { return byID; },
  get custom() { return custom; },

  /** Called by the app whenever its saved custom exercises change. */
  setCustom(exercises: Exercise[]) {
    custom = exercises.filter((e) => e.id.startsWith(CUSTOM_PREFIX));
    all = [...builtIn, ...custom];
    byID = index(all);
  },

  /** Never fails: an unknown id becomes a neutral placeholder so saved workouts still display. */
  exercise(id: string): Exercise {
    return byID.get(id) ?? {
      id, name: placeholderName(id), primary: [], secondary: [], equipment: [], pattern: 'isolation',
      isCompound: false, level: 'beginner', starterOneRM: 0, jointsStressed: [], isTimed: false,
    };
  },

  /** A reasonable starting 1RM for a new custom exercise: the median of similar built-ins. */
  suggestedStarterOneRM(primary: Muscle[], equipment: Equipment[], isCompound: boolean): number {
    const probe: Exercise = { ...Catalog.exercise('probe'), primary, equipment, isCompound, starterOneRM: 1 };
    const probeLoad = loadEquipment(probe);
    const loaded = builtIn.filter((e) => !isBodyweight(e));
    const tiers: ((e: Exercise) => boolean)[] = [
      (e) => e.primary[0] === primary[0] && loadEquipment(e) === probeLoad && e.isCompound === isCompound,
      (e) => e.primary[0] === primary[0] && loadEquipment(e) === probeLoad,
      (e) => loadEquipment(e) === probeLoad && e.isCompound === isCompound,
    ];
    for (const match of tiers) {
      const values = loaded.filter(match).map((e) => e.starterOneRM).sort((a, b) => a - b);
      if (values.length) return values[Math.floor(values.length / 2)];
    }
    return isCompound ? 40 : 15;
  },
};

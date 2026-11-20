// All loads inside the engine are kilograms. The app converts for display.
// Dates are epoch milliseconds.

export const MUSCLES = [
  'chest', 'frontDelts', 'sideDelts', 'rearDelts', 'triceps', 'biceps', 'forearms',
  'lats', 'upperBack', 'lowerBack', 'abs',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export function muscleName(m: Muscle): string {
  if (m === 'upperBack') return 'Upper Back';
  if (m === 'lowerBack') return 'Lower Back';
  if (m === 'frontDelts') return 'Front Delts';
  if (m === 'sideDelts') return 'Side Delts';
  if (m === 'rearDelts') return 'Rear Delts';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** Equipment a gym can own. The setup screens list these in groups; exercises ask for `Need`s instead. */
export const EQUIPMENT = [
  'barbell', 'ezBar', 'trapBar', 'dumbbell', 'kettlebell', 'dipBelt',
  'flatBench', 'adjustableBench', 'squatRack', 'pullUpBar', 'dipStation', 'preacherBench', 'backExtension',
  'cableDual', 'cableColumn', 'latPulldown', 'lowRow',
  'rope', 'straightBar', 'singleHandle', 'vBar', 'ankleStrap',
  'legPress', 'hackSquat', 'legExtension', 'seatedLegCurl', 'legCurl', 'calfMachine', 'hipAbductorMachine',
  'chestPressMachine', 'pecDeck', 'shoulderPressMachine', 'lateralRaiseMachine', 'rowMachine', 'smithMachine',
  'resistanceBand', 'abWheel',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/**
 * What an exercise needs. Most are pieces of equipment; a few are things several pieces provide:
 * any bench, a high pulley, a low pulley, or a pulley you can set at any height.
 */
export const NEEDS = [
  'barbell', 'ezBar', 'trapBar', 'dumbbell', 'kettlebell', 'dipBelt',
  'bench', 'adjustableBench', 'squatRack', 'pullUpBar', 'dipStation', 'preacherBench', 'backExtension',
  'cableHigh', 'cableLow', 'cableAdjustable', 'latPulldown',
  'rope', 'straightBar', 'singleHandle', 'vBar', 'ankleStrap',
  'legPress', 'hackSquat', 'legExtension', 'seatedLegCurl', 'legCurl', 'calfMachine', 'hipAbductorMachine',
  'chestPressMachine', 'pecDeck', 'shoulderPressMachine', 'lateralRaiseMachine', 'rowMachine', 'smithMachine',
  'resistanceBand', 'abWheel',
] as const;
export type Need = (typeof NEEDS)[number];

/** Everything a set of equipment lets you do. */
export function provides(equipment: readonly Equipment[]): Set<Need> {
  const has = (e: Equipment) => equipment.includes(e);
  const out = new Set<Need>(equipment.filter((e): e is Equipment & Need => (NEEDS as readonly string[]).includes(e)));
  if (has('flatBench') || has('adjustableBench')) out.add('bench');
  // Preacher curls work over the back pad of an incline bench.
  if (has('adjustableBench')) out.add('preacherBench');
  if (has('cableDual') || has('cableColumn')) for (const n of ['cableHigh', 'cableLow', 'cableAdjustable'] as const) out.add(n);
  if (has('latPulldown')) out.add('cableHigh');
  if (has('lowRow')) out.add('cableLow');
  return out;
}

/** Load-step settings are per kind of load: all cables share one stack step, for example. */
export const LOAD_KINDS = [
  'barbell', 'trapBar', 'ezBar', 'smithMachine', 'dumbbell', 'kettlebell', 'plates', 'machine',
  'cable', 'latPulldown', 'legPress', 'legCurl', 'legExtension', 'chestPressMachine', 'shoulderPressMachine',
] as const;
export type LoadKind = (typeof LOAD_KINDS)[number];

/** Default load step in kg when a gym doesn't specify one. */
export function defaultIncrement(e: LoadKind): number {
  switch (e) {
    case 'barbell': case 'ezBar': case 'trapBar': case 'smithMachine': case 'plates': return 2.5;
    case 'dumbbell': return 2;
    case 'kettlebell': return 4;
    default: return 5;
  }
}

/** Default load step in lb. */
export function defaultIncrementPounds(e: LoadKind): number {
  switch (e) {
    case 'barbell': case 'ezBar': case 'trapBar': case 'smithMachine': case 'dumbbell': case 'plates': return 5;
    case 'kettlebell': return 9;
    default: return 10;
  }
}

/** Bar weight in kg, used for warm-ups and rounding. */
export function baseLoad(e: LoadKind): number {
  return e === 'barbell' || e === 'trapBar' ? 20 : e === 'ezBar' ? 10 : 0;
}

export function baseLoadPounds(e: LoadKind): number {
  return e === 'barbell' || e === 'trapBar' ? 45 : e === 'ezBar' ? 25 : 0;
}

export const PATTERNS = [
  'squat', 'hinge', 'lunge', 'horizontalPush', 'verticalPush', 'horizontalPull', 'verticalPull',
  'isolation', 'core', 'carry',
  /** Stretches and warm-up drills: never auto-planned and not counted toward fatigue. */
  'mobility',
] as const;
export type MovementPattern = (typeof PATTERNS)[number];

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];
export const levelRank = (l: Level): number => LEVELS.indexOf(l);

export const JOINTS = ['shoulder', 'elbow', 'wrist', 'lowerBack', 'hip', 'knee', 'ankle', 'neck'] as const;
export type Joint = (typeof JOINTS)[number];

export interface Exercise {
  id: string;
  name: string;
  primary: Muscle[];
  secondary: Muscle[];
  /** What it needs; a gym must provide all of them. */
  equipment: Need[];
  pattern: MovementPattern;
  isCompound: boolean;
  level: Level;
  /** Rough starting 1RM (kg) for a new intermediate lifter; 0 = bodyweight. */
  starterOneRM: number;
  jointsStressed: Joint[];
  /** Logged in seconds instead of reps (planks, carries). */
  isTimed: boolean;
  /** The user's own how-to notes; only custom exercises have them. */
  notes?: string;
}

export const CUSTOM_PREFIX = 'custom-';

export const isBodyweight = (e: Exercise) => e.starterOneRM === 0;
export const isCustom = (e: Exercise) => e.id.startsWith(CUSTOM_PREFIX);

const LOAD_ORDER: [Need, LoadKind][] = [
  ['barbell', 'barbell'], ['trapBar', 'trapBar'], ['ezBar', 'ezBar'], ['smithMachine', 'smithMachine'],
  ['dumbbell', 'dumbbell'], ['kettlebell', 'kettlebell'], ['dipBelt', 'plates'], ['hackSquat', 'plates'], ['latPulldown', 'latPulldown'],
  ['cableHigh', 'cable'], ['cableLow', 'cable'], ['cableAdjustable', 'cable'], ['legPress', 'legPress'], ['legCurl', 'legCurl'],
  ['legExtension', 'legExtension'], ['chestPressMachine', 'chestPressMachine'], ['shoulderPressMachine', 'shoulderPressMachine'],
  ['seatedLegCurl', 'machine'], ['calfMachine', 'machine'], ['hipAbductorMachine', 'machine'], ['pecDeck', 'machine'],
  ['lateralRaiseMachine', 'machine'], ['rowMachine', 'machine'],
];

/** The kind of load that sets the step size and bar weight. */
export function loadEquipment(e: Exercise): LoadKind | undefined {
  return LOAD_ORDER.find(([need]) => e.equipment.includes(need))?.[1];
}

/** Whether a gym has everything an exercise needs. */
export function gymHas(g: Gym, e: Exercise): boolean {
  const p = provides(g.equipment);
  return e.equipment.every((n) => p.has(n));
}

// MARK: - User plan

export const GOALS = ['buildMuscle', 'getLean', 'getStronger', 'reduceBodyweight', 'improveFitness', 'powerlifting'] as const;
export type Goal = (typeof GOALS)[number];

export const SPLITS = ['pushPullLegs', 'upperLower', 'fullBody', 'freshMuscles'] as const;
export type Split = (typeof SPLITS)[number];

export const VARIABILITIES = ['consistent', 'balanced', 'variable'] as const;
export type Variability = (typeof VARIABILITIES)[number];

export const PREFERENCES = ['more', 'less', 'exclude'] as const;
export type ExercisePreference = (typeof PREFERENCES)[number];

export const DAY_FOCUSES = ['push', 'pull', 'legs', 'upper', 'lower', 'fullBody', 'recovered'] as const;
export type DayFocus = (typeof DAY_FOCUSES)[number];

export function focusMuscles(f: DayFocus): Muscle[] {
  switch (f) {
    case 'push': return ['chest', 'frontDelts', 'sideDelts', 'triceps'];
    case 'pull': return ['lats', 'upperBack', 'rearDelts', 'biceps', 'forearms'];
    case 'legs': return ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'lowerBack'];
    case 'upper': return [...focusMuscles('push'), ...focusMuscles('pull')];
    case 'lower': return [...focusMuscles('legs'), 'abs'];
    default: return [...MUSCLES];
  }
}

export interface Gym {
  id: string;
  name: string;
  equipment: Equipment[];
  /** Plates and dumbbells are in pounds; increments below are then in lb too. */
  usesPounds: boolean;
  /** Overrides for load steps, in the gym's unit. */
  increments: Partial<Record<LoadKind, number>>;
  /** 2 since equipment was split into specific pieces; older saves are converted on load. */
  equipmentVersion?: number;
  /** Set when an older, broader equipment list was converted, until you've checked it. */
  reviewEquipment?: boolean;
  /** Plates this gym owns, in its unit, heaviest first. Unset means the standard set, unlimited. */
  plates?: PlateStock[];
  /** Bar weights in the gym's unit; a kind left out uses the standard bar. */
  bars?: Partial<Record<BarKind, number>>;
}

/** One plate size a gym owns. `pairs` unset means as many as needed. */
export interface PlateStock { weight: number; pairs?: number }

/** Bars whose weight a gym can set. The Smith machine's is its starting weight (counterbalance included). */
export const BAR_KINDS = ['barbell', 'ezBar', 'trapBar', 'smithMachine'] as const;
export type BarKind = (typeof BAR_KINDS)[number];

/** Kinds that take plates: on both sides of a bar or sled, or hung on a dip belt. */
export const PLATE_LOADED: readonly LoadKind[] = ['barbell', 'ezBar', 'trapBar', 'smithMachine', 'plates'];
export const isPlateLoaded = (e: LoadKind) => PLATE_LOADED.includes(e);
/** Kinds loaded with plates on both sides, where the smallest jump is two plates. */
export const PAIR_LOADED: readonly LoadKind[] = ['barbell', 'ezBar', 'trapBar', 'smithMachine'];

/** Plates per jump for a kind of load: 2 on a bar, 1 on a dip belt or vest ('plates'), 0 when it takes no plates. */
export function kindSides(e: LoadKind): 0 | 1 | 2 {
  return PAIR_LOADED.includes(e) ? 2 : e === 'plates' ? 1 : 0;
}

/**
 * Plates per jump for an exercise: 2 for bars and plate-loaded sleds (a hack squat), 1 for a dip belt,
 * vest or held plate, 0 when it takes no plates.
 */
export function plateSides(e: Exercise): 0 | 1 | 2 {
  const kind = loadEquipment(e) ?? (isBodyweight(e) ? undefined : 'plates');
  if (!kind) return 0;
  if (kind === 'plates' && e.equipment.includes('hackSquat')) return 2;
  return kindSides(kind);
}

/** Plates heavier than this, bars heavier than this, or more pairs than this are corrupt or a typo. */
export const MAX_PLATE = 100;
export const MAX_BAR = 150;
export const MAX_PAIRS = 50;

/** The plates used when a gym doesn't list its own. */
export const STANDARD_PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] };
/** A typical home set: no 25s or 15s (35s in lb). */
export const HOME_PLATES = { kg: [20, 10, 5, 2.5, 1.25], lb: [45, 25, 10, 5, 2.5] };

export const POUNDS_PER_KG = 2.2046226218;

export function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function makeGym(name: string, equipment: Equipment[], usesPounds = false,
                        increments: Partial<Record<LoadKind, number>> = {}, id = uuid()): Gym {
  return { id, name, equipment: [...equipment], equipmentVersion: 2, usesPounds, increments: { ...increments } };
}

/**
 * Load step in the gym's unit. With the gym's own plates listed, plate-loaded kinds default to the
 * smallest jump those plates make: `sides` × the plates' common divisor (two 1.25s on a bar, one on a
 * belt; 5 a side for 25/20/15/10 rather than two 10s).
 */
export function gymIncrement(g: Gym, e: LoadKind, sides: number = kindSides(e)): number {
  const set = g.increments[e];
  if (set !== undefined) return set;
  if (g.plates?.length && sides) return plateJump(g.plates, sides);
  return g.usesPounds ? defaultIncrementPounds(e) : defaultIncrement(e);
}

/** The finest jump these plates make (given enough of them): `sides` × the common divisor of the sizes. */
export function plateJump(stock: readonly PlateStock[], sides: number): number {
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
  const unit = stock.map((p) => Math.round(p.weight * 100)).reduce((x, y) => gcd(x, y), 0);
  return (sides * unit) / 100;
}

/**
 * When a step set in Settings is finer than the gym's plates (its own, else the standard set) can make,
 * the plates' smallest jump, which suggestions go up by instead; else 0.
 */
export function stepTooFine(g: Gym, e: LoadKind): number {
  const sides = kindSides(e);
  const set = g.increments[e];
  if (!sides || set === undefined) return 0;
  const jump = plateJump(gymPlates(g), sides);
  return set < jump - 1e-9 ? jump : 0;
}

/** Bar weight in the gym's unit: the gym's own, else the standard one (0 for kinds with no bar). */
export function gymBar(g: Gym, e: LoadKind): number {
  const own = (g.bars as Partial<Record<LoadKind, number>> | undefined)?.[e];
  if (own !== undefined) return own;
  return g.usesPounds ? baseLoadPounds(e) : baseLoad(e);
}

/** The gym's plates, or the standard set (unlimited) when it doesn't list its own. */
export function gymPlates(g: Gym): PlateStock[] {
  return g.plates?.length ? g.plates : (g.usesPounds ? STANDARD_PLATES.lb : STANDARD_PLATES.kg).map((weight) => ({ weight }));
}

/**
 * Plates for one side, heaviest first, to load `total` on a bar of `bar` (all in the plates' unit), using
 * only what's owned. `remainder` is what's left per side when the exact weight can't be made.
 */
export function platesPerSide(total: number, bar: number, stock: readonly PlateStock[]): { plates: number[]; remainder: number } {
  const target = Math.max(0, (total - bar) / 2);
  const sizes = [...stock].sort((a, b) => b.weight - a.weight);
  const best = loadableSides(sizes, target);
  // The heaviest side at or under the target that the plates make exactly.
  let side = 0;
  for (const s of best.sides) if (s <= target + 1e-6 && s > side) side = s;
  const plates = best.make(side);
  return { plates, remainder: Math.round((target - side) * 100) / 100 };
}

/** Per side, in the gym's unit; far past any real lift. */
const MAX_SIDE = 1200;
const plateCache = new Map<string, { unit: number; can: Uint8Array[] }>();

/**
 * Every weight one side can take with these plates (heaviest first), and a way to pick the plates for one:
 * as many of the heaviest as still leave the rest makeable. Worked in units of the plates' common divisor
 * (in hundredths) so 1.25 and 0.5 plates stay exact.
 */
function loadableSides(sizes: PlateStock[], target: number): { sides: number[]; make: (side: number) => number[] } {
  const hundredths = sizes.map((p) => Math.round(p.weight * 100));
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
  const unit = hundredths.reduce((x, y) => gcd(x, y), 0) || 1;
  const steps = hundredths.map((h) => h / unit);
  const cap = Math.min(Math.ceil((Math.max(target, MAX_SIDE) * 100) / unit), 400_000);
  const key = `${sizes.map((p) => `${p.weight}x${p.pairs ?? ''}`).join(',')}|${cap}`;
  let entry = plateCache.get(key);
  if (!entry) {
    // can[i][n]: n units per side can be made from plates i and lighter (can[sizes.length] is the empty side).
    const can: Uint8Array[] = new Array(sizes.length + 1);
    can[sizes.length] = new Uint8Array(cap + 1);
    can[sizes.length][0] = 1;
    const count = new Int32Array(cap + 1);
    for (let i = sizes.length - 1; i >= 0; i--) {
      const next = can[i + 1], here = new Uint8Array(cap + 1), w = steps[i], limit = sizes[i].pairs ?? Infinity;
      for (let n = 0; n <= cap; n++) {
        if (next[n]) { here[n] = 1; count[n] = 0; } else if (n >= w && here[n - w] && count[n - w] < limit) { here[n] = 1; count[n] = count[n - w] + 1; }
      }
      can[i] = here;
    }
    entry = { unit, can };
    if (plateCache.size > 50) plateCache.clear();
    plateCache.set(key, entry);
  }
  const { can } = entry;
  const sides: number[] = [];
  for (let n = 0; n <= cap; n++) if (can[0][n]) sides.push((n * unit) / 100);
  const make = (side: number) => {
    const out: number[] = [];
    let n = Math.round((side * 100) / unit);
    if (!can[0][n]) return out;
    sizes.forEach((p, i) => {
      let k = Math.min(p.pairs ?? Infinity, Math.floor(n / steps[i]));
      while (k > 0 && !can[i + 1][n - k * steps[i]]) k--;
      for (let j = 0; j < k; j++) out.push(p.weight);
      n -= k * steps[i];
    });
    return out;
  };
  return { sides, make };
}

/**
 * The nearest total (bar plus `sides` sets of owned plates: pairs on a bar, single plates on a belt) to
 * `weight`, never below the bar; ties go lighter.
 */
export function nearestLoadable(weight: number, bar: number, stock: readonly PlateStock[], sides = 2): number {
  return loadableTotal(weight, bar, stock, sides, 0)!;
}

/**
 * A total the plates make: the nearest (`dir` 0, ties lighter, never below the bar), the lightest at or
 * above `weight` (1), or the heaviest at or below it (−1). Undefined when there's none that way: past
 * the most the plates make, or under the bar.
 */
export function loadableTotal(weight: number, bar: number, stock: readonly PlateStock[], sides: number, dir: 0 | 1 | -1): number | undefined {
  const target = (weight - bar) / sides;
  const list = loadableSides([...stock].sort((a, b) => b.weight - a.weight), Math.max(0, target)).sides;
  if (dir > 0) {
    const s = list.find((x) => x >= target - 1e-6);
    return s === undefined ? undefined : bar + sides * s;
  }
  if (dir < 0) {
    let best: number | undefined;
    for (const x of list) if (x <= target + 1e-6) best = x;
    return best === undefined ? undefined : bar + sides * best;
  }
  const t = Math.max(0, target);
  let best = 0;
  for (const x of list) if (Math.abs(x - t) < Math.abs(best - t) - 1e-9) best = x;
  return bar + sides * best;
}

/** Load step in kg. */
export function gymIncrementKg(g: Gym, e: LoadKind, sides: number = kindSides(e)): number {
  return gymIncrement(g, e, sides) / (g.usesPounds ? POUNDS_PER_KG : 1);
}

/** Rounds to a loadable weight: bar plus whole increments, never below the bar. */
export function roundLoad(weight: number, increment: number, base: number): number {
  if (increment <= 0) return weight;
  const steps = Math.round((weight - base) / increment);
  return Math.max(base, base + steps * increment);
}

/**
 * Whether weights for this kind come from the plates themselves rather than a step grid: when the gym
 * lists its plates, or its step is finer than the standard plates make.
 */
function usesPlateMath(g: Gym, e: LoadKind, sides: number): boolean {
  if (!sides) return false;
  return !!g.plates?.length || gymIncrement(g, e, sides) < plateJump(gymPlates(g), sides) - 1e-9;
}

/** A loadable weight in kg near `kg` (`dir` as in `loadableTotal`), or undefined when there's none that way. */
function roundIn(g: Gym, kg: number, e: LoadKind, sides: number, dir: 0 | 1 | -1): number | undefined {
  const toGym = g.usesPounds ? POUNDS_PER_KG : 1;
  const bar = gymBar(g, e);
  const w = kg * toGym;
  let out: number | undefined;
  if (usesPlateMath(g, e, sides)) {
    // A weight the plates actually make: a step grid on top would skip some (bar + 15 a side with 10s and 15s).
    out = loadableTotal(w, bar, gymPlates(g), sides, dir);
  } else {
    const step = gymIncrement(g, e, sides);
    if (step <= 0) return kg;
    const raw = (w - bar) / step;
    const k = dir > 0 ? Math.ceil(raw - 1e-6) : dir < 0 ? Math.floor(raw + 1e-6) : Math.round(raw);
    out = dir < 0 && k < 0 ? undefined : bar + Math.max(0, k) * step;
  }
  return out === undefined ? undefined : out / toGym;
}

/** Rounds a kg load to something loadable in this gym, returned in kg. `sides`: see `plateSides`. */
export function gymRound(g: Gym, kg: number, e: LoadKind, sides: number = kindSides(e)): number {
  return roundIn(g, kg, e, sides, 0)!;
}

/** The lightest loadable weight at or above `kg`, in kg; undefined past the most the plates make. */
export function gymRoundUp(g: Gym, kg: number, e: LoadKind, sides: number = kindSides(e)): number | undefined {
  return roundIn(g, kg, e, sides, 1);
}

/** The heaviest loadable weight at or below `kg`, in kg; undefined under the bar. */
export function gymRoundDown(g: Gym, kg: number, e: LoadKind, sides: number = kindSides(e)): number | undefined {
  return roundIn(g, kg, e, sides, -1);
}

export function gymBaseLoadKg(g: Gym, e: LoadKind): number {
  return g.usesPounds ? gymBar(g, e) / POUNDS_PER_KG : gymBar(g, e);
}

/** The preset (standard or home) this plate list is exactly, in its unit, with no pair counts. */
function platePreset(plates: readonly PlateStock[] | undefined, unit: 'kg' | 'lb') {
  const same = (list: number[]) => !!plates && plates.length === list.length && plates.every((p, i) => p.pairs === undefined && p.weight === list[i]);
  return [STANDARD_PLATES, HOME_PLATES].find((set) => same(set[unit]));
}

/**
 * The gym in another unit. Load steps were in the old unit and are dropped (the plates' own jump takes
 * over). A preset plate set becomes the same preset in the new unit; any other list becomes the nearest
 * standard plates in the new unit, keeping pair counts (two sizes landing on one plate add up). Bar
 * weights are converted to the nearest half unit.
 */
export function withGymUnits(g: Gym, pounds: boolean): Gym {
  if (g.usesPounds === pounds) return g;
  const { plates, bars, ...rest } = g;
  const to = pounds ? 'lb' : 'kg';
  const factor = pounds ? POUNDS_PER_KG : 1 / POUNDS_PER_KG;
  const preset = platePreset(plates, g.usesPounds ? 'lb' : 'kg');
  let converted: PlateStock[] | undefined;
  if (preset) converted = preset[to].map((weight) => ({ weight }));
  else if (plates?.length) {
    const bySize = new Map<number, PlateStock>();
    for (const p of plates) {
      const w = p.weight * factor;
      const weight = STANDARD_PLATES[to].reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
      const seen = bySize.get(weight);
      const pairs = !seen ? p.pairs : seen.pairs === undefined || p.pairs === undefined ? undefined : Math.min(MAX_PAIRS, seen.pairs + p.pairs);
      bySize.set(weight, pairs === undefined ? { weight } : { weight, pairs });
    }
    converted = [...bySize.values()].sort((a, b) => b.weight - a.weight);
  }
  const newBars: NonNullable<Gym['bars']> = {};
  for (const [k, v] of Object.entries(bars ?? {}) as [BarKind, number][]) newBars[k] = Math.min(MAX_BAR, Math.round(v * factor * 2) / 2);
  return {
    ...rest, usesPounds: pounds, increments: {},
    ...(converted ? { plates: converted } : {}), ...(Object.keys(newBars).length ? { bars: newBars } : {}),
  };
}

/** Whether switching units would change plates or bars the user set on this gym (beyond a preset plate set). */
export function hasCustomPlates(g: Gym): boolean {
  const ownList = !!g.plates?.length && !platePreset(g.plates, g.usesPounds ? 'lb' : 'kg');
  return ownList || Object.keys(g.bars ?? {}).length > 0;
}

export const Gyms = {
  /** Plates left unset: the full standard set, as many as needed. */
  commercial: () => makeGym('Full Gym', [...EQUIPMENT]),
  /**
   * Barbell, EZ bar, dumbbells, benches, rack, dip station and a lat pulldown / low row station with attachments.
   * A typical home plate set: no 25s or 15s (35s in lb), as many of each as needed.
   */
  homeBarbell: (): Gym => ({ ...makeGym('Home Gym (Barbell + Cables)', [
    'barbell', 'ezBar', 'dumbbell', 'flatBench', 'adjustableBench', 'squatRack', 'dipStation', 'latPulldown', 'lowRow',
    'rope', 'straightBar', 'singleHandle', 'vBar',
  ]), plates: HOME_PLATES.kg.map((weight) => ({ weight })) }),
  home: () => makeGym('Home Gym', ['dumbbell', 'adjustableBench', 'pullUpBar', 'resistanceBand', 'kettlebell']),
  bodyweight: () => makeGym('No Equipment', []),
};

export interface UserPlan {
  goal: Goal;
  experience: Level;
  split: Split;
  sessionMinutes: number;
  variability: Variability;
  warmUpSets: boolean;
  /** Pair non-competing exercises back to back, resting after each pair. */
  supersets: boolean;
  preferences: Record<string, ExercisePreference>;
  injuries: Joint[];
}

export function defaultPlan(over: Partial<UserPlan> = {}): UserPlan {
  return {
    goal: 'buildMuscle', experience: 'intermediate', split: 'pushPullLegs', sessionMinutes: 60,
    variability: 'balanced', warmUpSets: true, supersets: false, preferences: {}, injuries: [], ...over,
  };
}

// MARK: - History

export type Side = 'left' | 'right';

/**
 * A working set that isn't a plain straight set. `drop`: straight on from the set before at a lighter
 * weight, no rest. `failure`: taken to failure, so no reps in reserve. Absent for a straight set.
 */
export type SetType = 'drop' | 'failure';

export interface LoggedSet {
  weight: number;
  reps: number;
  rir?: number | null;
  isWarmup: boolean;
  /** Which side, for per-arm or per-leg work. */
  side?: Side | null;
  type?: SetType | null;
}

export interface RepRange { lower: number; upper: number }
export const repRange = (lower: number, upper: number): RepRange => ({ lower, upper: Math.max(lower, upper) });
export const repRangeText = (r: RepRange) => (r.lower === r.upper ? `${r.lower}` : `${r.lower}–${r.upper}`);

export interface LoggedExercise {
  exerciseID: string;
  sets: LoggedSet[];
  /** What was prescribed, so progression can tell a hit from a miss. */
  targetReps?: number | null;
  /** Program slot this was logged against, with the range and RIR it prescribed. */
  slotID?: string | null;
  repRange?: RepRange | null;
  targetRIR?: number | null;
}

export const workingSets = (l: LoggedExercise): LoggedSet[] => l.sets.filter((s) => !s.isWarmup && s.reps > 0);

/**
 * Working sets without drop sets: what progression judges. A drop set is extra work at a lighter
 * weight, so it shouldn't count as a missed rep target or a lighter top weight. Volume, recovery and
 * weekly set counts use `workingSets`.
 */
export const straightSets = (l: LoggedExercise): LoggedSet[] => workingSets(l).filter((s) => s.type !== 'drop');

/** Which program day a logged workout was. */
export interface ProgramRef {
  programID: string;
  week: number;
  dayID: string;
  isDeload: boolean;
}

export interface WorkoutRecord {
  date: number;
  focus?: DayFocus | null;
  exercises: LoggedExercise[];
  /** Set when the workout was a program day. */
  program?: ProgramRef | null;
}

export interface ExternalActivity {
  date: number;
  minutes: number;
  /** Muscles the activity loads (e.g. legs for running or cycling). */
  muscles: Muscle[];
}

export interface RecoveryOverride {
  muscle: Muscle;
  recovery: number;
  date: number;
}

export type MuscleMap = Partial<Record<Muscle, number>>;

export const DAY_MS = 86_400_000;

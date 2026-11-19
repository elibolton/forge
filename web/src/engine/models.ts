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
  'legPress', 'legExtension', 'legCurl', 'chestPressMachine', 'shoulderPressMachine', 'smithMachine',
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
  'legPress', 'legExtension', 'legCurl', 'chestPressMachine', 'shoulderPressMachine', 'smithMachine',
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
  'barbell', 'trapBar', 'ezBar', 'smithMachine', 'dumbbell', 'kettlebell', 'plates',
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
  ['dumbbell', 'dumbbell'], ['kettlebell', 'kettlebell'], ['dipBelt', 'plates'], ['latPulldown', 'latPulldown'],
  ['cableHigh', 'cable'], ['cableLow', 'cable'], ['cableAdjustable', 'cable'], ['legPress', 'legPress'], ['legCurl', 'legCurl'],
  ['legExtension', 'legExtension'], ['chestPressMachine', 'chestPressMachine'], ['shoulderPressMachine', 'shoulderPressMachine'],
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
}

export const POUNDS_PER_KG = 2.2046226218;

export function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function makeGym(name: string, equipment: Equipment[], usesPounds = false,
                        increments: Partial<Record<LoadKind, number>> = {}, id = uuid()): Gym {
  return { id, name, equipment: [...equipment], equipmentVersion: 2, usesPounds, increments: { ...increments } };
}

/** Load step in the gym's unit. */
export function gymIncrement(g: Gym, e: LoadKind): number {
  return g.increments[e] ?? (g.usesPounds ? defaultIncrementPounds(e) : defaultIncrement(e));
}

/** Load step in kg. */
export function gymIncrementKg(g: Gym, e: LoadKind): number {
  return g.usesPounds ? gymIncrement(g, e) / POUNDS_PER_KG : gymIncrement(g, e);
}

/** Rounds to a loadable weight: bar plus whole increments, never below the bar. */
export function roundLoad(weight: number, increment: number, base: number): number {
  if (increment <= 0) return weight;
  const steps = Math.round((weight - base) / increment);
  return Math.max(base, base + steps * increment);
}

/** Rounds a kg load to something loadable in this gym, returned in kg. */
export function gymRound(g: Gym, kg: number, e: LoadKind): number {
  if (g.usesPounds) {
    return roundLoad(kg * POUNDS_PER_KG, gymIncrement(g, e), baseLoadPounds(e)) / POUNDS_PER_KG;
  }
  return roundLoad(kg, gymIncrement(g, e), baseLoad(e));
}

export function gymBaseLoadKg(g: Gym, e: LoadKind): number {
  return g.usesPounds ? baseLoadPounds(e) / POUNDS_PER_KG : baseLoad(e);
}

export const Gyms = {
  commercial: () => makeGym('Commercial Gym', [...EQUIPMENT]),
  /** Barbell, EZ bar, dumbbells, benches, rack, dip station and a lat pulldown / low row station with attachments. */
  homeBarbell: () => makeGym('Home Gym', [
    'barbell', 'ezBar', 'dumbbell', 'flatBench', 'adjustableBench', 'squatRack', 'dipStation', 'latPulldown', 'lowRow',
    'rope', 'straightBar', 'singleHandle', 'vBar',
  ]),
  home: () => makeGym('Home', ['dumbbell', 'adjustableBench', 'pullUpBar', 'resistanceBand', 'kettlebell']),
  bodyweight: () => makeGym('Bodyweight', []),
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

// All loads inside the engine are kilograms. The app converts for display.
// Dates are epoch milliseconds.

export const MUSCLES = [
  'chest', 'shoulders', 'triceps', 'biceps', 'forearms',
  'lats', 'upperBack', 'lowerBack', 'abs',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export function muscleName(m: Muscle): string {
  if (m === 'upperBack') return 'Upper Back';
  if (m === 'lowerBack') return 'Lower Back';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export const EQUIPMENT = [
  'barbell', 'ezBar', 'trapBar', 'dumbbell', 'kettlebell',
  'bench', 'squatRack', 'pullUpBar', 'dipStation',
  'cable', 'latPulldown', 'legPress', 'legCurl', 'legExtension',
  'chestPressMachine', 'shoulderPressMachine', 'smithMachine',
  'resistanceBand',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** Default load step in kg when a gym doesn't specify one. */
export function defaultIncrement(e: Equipment): number {
  switch (e) {
    case 'barbell': case 'ezBar': case 'trapBar': case 'smithMachine': return 2.5;
    case 'dumbbell': return 2;
    case 'kettlebell': return 4;
    default: return 5;
  }
}

/** Default load step in lb. */
export function defaultIncrementPounds(e: Equipment): number {
  switch (e) {
    case 'barbell': case 'ezBar': case 'trapBar': case 'smithMachine': case 'dumbbell': return 5;
    case 'kettlebell': return 9;
    default: return 10;
  }
}

/** Bar weight in kg, used for warm-ups and rounding. */
export function baseLoad(e: Equipment): number {
  return e === 'barbell' || e === 'trapBar' ? 20 : e === 'ezBar' ? 10 : 0;
}

export function baseLoadPounds(e: Equipment): number {
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
  equipment: Equipment[];
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

const LOAD_ORDER: Equipment[] = [
  'barbell', 'trapBar', 'ezBar', 'smithMachine', 'dumbbell', 'kettlebell',
  'cable', 'latPulldown', 'legPress', 'legCurl', 'legExtension', 'chestPressMachine', 'shoulderPressMachine',
];

/** The equipment that sets the load increment and bar weight. */
export function loadEquipment(e: Exercise): Equipment | undefined {
  return LOAD_ORDER.find((eq) => e.equipment.includes(eq));
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
    case 'push': return ['chest', 'shoulders', 'triceps'];
    case 'pull': return ['lats', 'upperBack', 'biceps', 'forearms'];
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
  increments: Partial<Record<Equipment, number>>;
}

export const POUNDS_PER_KG = 2.2046226218;

export function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function makeGym(name: string, equipment: Equipment[], usesPounds = false,
                        increments: Partial<Record<Equipment, number>> = {}, id = uuid()): Gym {
  return { id, name, equipment: [...equipment], usesPounds, increments: { ...increments } };
}

/** Load step in the gym's unit. */
export function gymIncrement(g: Gym, e: Equipment): number {
  return g.increments[e] ?? (g.usesPounds ? defaultIncrementPounds(e) : defaultIncrement(e));
}

/** Load step in kg. */
export function gymIncrementKg(g: Gym, e: Equipment): number {
  return g.usesPounds ? gymIncrement(g, e) / POUNDS_PER_KG : gymIncrement(g, e);
}

/** Rounds to a loadable weight: bar plus whole increments, never below the bar. */
export function roundLoad(weight: number, increment: number, base: number): number {
  if (increment <= 0) return weight;
  const steps = Math.round((weight - base) / increment);
  return Math.max(base, base + steps * increment);
}

/** Rounds a kg load to something loadable in this gym, returned in kg. */
export function gymRound(g: Gym, kg: number, e: Equipment): number {
  if (g.usesPounds) {
    return roundLoad(kg * POUNDS_PER_KG, gymIncrement(g, e), baseLoadPounds(e)) / POUNDS_PER_KG;
  }
  return roundLoad(kg, gymIncrement(g, e), baseLoad(e));
}

export function gymBaseLoadKg(g: Gym, e: Equipment): number {
  return g.usesPounds ? baseLoadPounds(e) / POUNDS_PER_KG : baseLoad(e);
}

export const Gyms = {
  commercial: () => makeGym('Commercial Gym', [...EQUIPMENT]),
  /** Barbell, EZ bar, dumbbells, bench, rack, dip station and a lat pulldown / low row cable station. */
  homeBarbell: () => makeGym('Home Gym', ['barbell', 'ezBar', 'dumbbell', 'bench', 'squatRack', 'dipStation', 'cable', 'latPulldown']),
  home: () => makeGym('Home', ['dumbbell', 'bench', 'pullUpBar', 'resistanceBand', 'kettlebell']),
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

export interface LoggedSet {
  weight: number;
  reps: number;
  rir?: number | null;
  isWarmup: boolean;
  /** Which side, for per-arm or per-leg work. */
  side?: Side | null;
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

// Display names for engine enums.
import type { DayFocus, Equipment, ExercisePreference, LoadKind, Need, Goal, Joint, Level, LoggedSet, Split, Variability } from '../engine';

export const goalTitle: Record<Goal, string> = {
  buildMuscle: 'Build Muscle', getLean: 'Get Lean', getStronger: 'Get Stronger',
  reduceBodyweight: 'Reduce Bodyweight', improveFitness: 'Improve Fitness', powerlifting: 'Powerlifting',
};
export const goalBlurb: Record<Goal, string> = {
  buildMuscle: 'Add size with moderate weights and plenty of volume.',
  getLean: 'Keep your muscle while you lose fat.',
  getStronger: 'Lift heavier with lower reps and longer rests.',
  reduceBodyweight: 'Burn more with circuits and shorter rests.',
  improveFitness: 'All-round strength, stamina and movement.',
  powerlifting: 'Peak your squat, bench press and deadlift.',
};

export const levelTitle: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
export const levelBlurb: Record<Level, string> = {
  beginner: 'New to lifting, or back after a long break.',
  intermediate: 'Training consistently for 6 months or more.',
  advanced: 'Years of structured training; you know your lifts.',
};

export const splitTitle: Record<Split, string> = {
  pushPullLegs: 'Push / Pull / Legs', upperLower: 'Upper / Lower', fullBody: 'Full Body', freshMuscles: 'Freshest Muscles',
};
export const splitBlurb: Record<Split, string> = {
  pushPullLegs: 'Rotate pushing, pulling and leg days.',
  upperLower: 'Alternate upper-body and lower-body days.',
  fullBody: 'Hit every major muscle each session.',
  freshMuscles: 'No fixed plan: each day trains whatever has recovered most.',
};

export const variabilityTitle: Record<Variability, string> = { consistent: 'More Consistent', balanced: 'Balanced', variable: 'More Variety' };

export const focusTitle: Record<DayFocus, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper Body', lower: 'Lower Body', fullBody: 'Full Body', recovered: 'Recovered Muscles',
};
export const swappableFocuses: DayFocus[] = ['recovered', 'push', 'pull', 'legs', 'upper', 'lower', 'fullBody'];

export function dayTitle(f: DayFocus): string {
  if (f === 'recovered') return 'Fresh Muscles';
  if (f === 'upper' || f === 'lower' || f === 'fullBody') return focusTitle[f];
  return `${focusTitle[f]} Day`;
}

export const equipmentTitle: Record<Equipment, string> = {
  barbell: 'Barbell and plates', ezBar: 'EZ bar', trapBar: 'Trap bar', dumbbell: 'Dumbbells', kettlebell: 'Kettlebells',
  dipBelt: 'Dip belt or weight vest', flatBench: 'Flat bench', adjustableBench: 'Adjustable bench (incline/decline)',
  squatRack: 'Squat or power rack', pullUpBar: 'Pull-up bar', dipStation: 'Dip station', preacherBench: 'Preacher bench',
  backExtension: 'Back extension / GHD', cableDual: 'Dual adjustable cables (crossover)', cableColumn: 'Single adjustable cable',
  latPulldown: 'Lat pulldown (high pulley)', lowRow: 'Seated row (low pulley)', rope: 'Rope', straightBar: 'Straight bar',
  singleHandle: 'Single handle', vBar: 'V-bar', ankleStrap: 'Ankle strap', legPress: 'Leg press', legExtension: 'Leg extension',
  legCurl: 'Leg curl', chestPressMachine: 'Chest press machine', shoulderPressMachine: 'Shoulder press machine',
  smithMachine: 'Smith machine', resistanceBand: 'Resistance bands', abWheel: 'Ab wheel',
};

/** The setup screens' groups, in the order you'd look around a gym. */
export const EQUIPMENT_GROUPS: { title: string; items: Equipment[]; foot?: string }[] = [
  { title: 'Free weights', items: ['barbell', 'ezBar', 'trapBar', 'dumbbell', 'kettlebell', 'dipBelt'] },
  { title: 'Benches and racks', items: ['flatBench', 'adjustableBench', 'squatRack', 'pullUpBar', 'dipStation', 'preacherBench', 'backExtension'],
    foot: 'An adjustable bench also works for preacher curls.' },
  { title: 'Cables', items: ['cableDual', 'cableColumn', 'latPulldown', 'lowRow'],
    foot: 'A pulldown/row combo station is both a lat pulldown and a seated row.' },
  { title: 'Cable attachments', items: ['rope', 'straightBar', 'singleHandle', 'vBar', 'ankleStrap'] },
  { title: 'Machines', items: ['legPress', 'legExtension', 'legCurl', 'chestPressMachine', 'shoulderPressMachine', 'smithMachine'] },
  { title: 'Small gear', items: ['resistanceBand', 'abWheel'] },
];

/** What an exercise needs, in words. */
export const needTitle: Record<Need, string> = {
  ...(equipmentTitle as unknown as Record<Need, string>),
  bench: 'Bench', adjustableBench: 'Adjustable bench', preacherBench: 'Preacher bench (or adjustable bench)',
  cableHigh: 'Cable, high pulley', cableLow: 'Cable, low pulley', cableAdjustable: 'Cable, adjustable height',
  latPulldown: 'Lat pulldown',
};

export const loadTitle: Record<LoadKind, string> = {
  barbell: 'Barbell', trapBar: 'Trap bar', ezBar: 'EZ bar', smithMachine: 'Smith machine', dumbbell: 'Dumbbells',
  kettlebell: 'Kettlebells', plates: 'Plates', cable: 'Cables', latPulldown: 'Lat pulldown', legPress: 'Leg press',
  legCurl: 'Leg curl', legExtension: 'Leg extension', chestPressMachine: 'Chest press', shoulderPressMachine: 'Shoulder press',
};

export const jointTitle = (j: Joint) => (j === 'lowerBack' ? 'Lower Back' : j.charAt(0).toUpperCase() + j.slice(1));

export const preferenceTitle: Record<ExercisePreference, string> = {
  more: 'Recommend More', less: 'Recommend Less', exclude: 'Never Recommend',
};

/** Badges for a logged exercise's sets: W for warm-ups, D for drop sets, and numbers for the rest. */
export function setLabels(sets: Pick<LoggedSet, 'isWarmup' | 'type'>[]): string[] {
  let n = 0;
  return sets.map((s) => (s.isWarmup ? 'W' : s.type === 'drop' ? 'D' : String(++n)));
}

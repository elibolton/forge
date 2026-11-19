// Display names for engine enums.
import type { DayFocus, Equipment, ExercisePreference, Goal, Joint, Level, Split, Variability } from '../engine';

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
  barbell: 'Barbell', ezBar: 'EZ Bar', trapBar: 'Trap Bar', dumbbell: 'Dumbbells', kettlebell: 'Kettlebells',
  bench: 'Bench', squatRack: 'Squat Rack', pullUpBar: 'Pull-Up Bar', dipStation: 'Dip Station', cable: 'Cable Machine',
  latPulldown: 'Lat Pulldown', legPress: 'Leg Press', legCurl: 'Leg Curl', legExtension: 'Leg Extension',
  chestPressMachine: 'Chest Press Machine', shoulderPressMachine: 'Shoulder Press Machine', smithMachine: 'Smith Machine',
  resistanceBand: 'Resistance Bands',
};

export const jointTitle = (j: Joint) => (j === 'lowerBack' ? 'Lower Back' : j.charAt(0).toUpperCase() + j.slice(1));

export const preferenceTitle: Record<ExercisePreference, string> = {
  more: 'Recommend More', less: 'Recommend Less', exclude: 'Never Recommend',
};

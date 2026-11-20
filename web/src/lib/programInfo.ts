// Plain-language descriptions of the built-in programs, for people who don't speak gym jargon.
import { Catalog, type Gym, type WorkoutProgram, gymFitsProgramExercise } from '../engine';

export interface ProgramInfo {
  /** One or two sentences: what it is. */
  about: string;
  /** Who it suits. */
  suits: string;
  /** What you need, in words. */
  equipment: string[];
}

const INFO: Record<string, ProgramInfo> = {
  'pplul-8wk-home': {
    about: 'Five workouts a week for 8 weeks to build muscle: a push day (chest, shoulders, triceps), a pull day (back, biceps), legs, then an upper-body and a lower-body day. Workouts get a little harder each week, and week 8 is a lighter week to recover.',
    suits: 'People who have lifted for a few months, can train 5 days a week for about an hour, and mainly want to build muscle.',
    equipment: ['Barbell and plates, with a squat rack', 'Adjustable bench (for incline work)', 'Dumbbells', 'EZ curl bar', 'Dip station', 'Cable lat pulldown and seated row'],
  },
};

const fallback = (p: WorkoutProgram): ProgramInfo => ({ about: p.summary, suits: '', equipment: [] });

export const programInfo = (p: WorkoutProgram): ProgramInfo => INFO[p.id] ?? fallback(p);

/** Lets a long name like "Push/Pull/Legs" wrap after each slash instead of being cut off. */
export const breakable = (s: string) => s.replaceAll('/', '/​');

/** How many of the program's exercises the gym has the equipment for. */
export function gymFit(p: WorkoutProgram, gym: Gym): { fits: number; total: number } {
  const ids = [...new Set(p.days.flatMap((d) => d.exercises.map((x) => x.exerciseID)))].filter((id) => Catalog.byID.has(id));
  return { fits: ids.filter((id) => gymFitsProgramExercise(gym, Catalog.exercise(id))).length, total: ids.length };
}

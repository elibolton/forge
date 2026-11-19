import type { Exercise } from './models';
import { builtInGuides } from './instructionsData';

/** How to perform an exercise: a few short cues and the most common mistake. */
export interface ExerciseGuide { steps: string[]; mistake?: string }

/** Built-in guide, or the notes saved with a custom exercise. */
export function guideFor(exercise: Exercise): ExerciseGuide | undefined {
  const g = builtInGuides[exercise.id];
  if (g) return g;
  const notes = exercise.notes?.trim();
  if (!notes) return undefined;
  return { steps: notes.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) };
}

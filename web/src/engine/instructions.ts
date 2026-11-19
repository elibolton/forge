import type { Exercise } from './models';
import { builtInGuides } from './instructionsData';
import { builtInTips } from './tipsData';

/** How to perform an exercise: short cues in order, tips (what to feel, setup details), and the most common mistake. */
export interface ExerciseGuide { steps: string[]; tips?: string[]; mistake?: string }

/** Built-in guide, or the notes saved with a custom exercise. */
export function guideFor(exercise: Exercise): ExerciseGuide | undefined {
  const g = builtInGuides[exercise.id];
  if (g) return g.tips || !builtInTips[exercise.id] ? g : { ...g, tips: builtInTips[exercise.id] };
  const notes = exercise.notes?.trim();
  if (!notes) return undefined;
  return { steps: notes.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) };
}

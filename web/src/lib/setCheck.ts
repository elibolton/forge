// Catches sets that are almost certainly typos before they reach history, where a bogus number would
// show up as a personal record and push progression the wrong way.

export type SetProblem =
  | { kind: 'noReps' }
  /** Far heavier than anything logged before; `heaviest` is kg, absent with no history. */
  | { kind: 'heavy'; heaviest?: number };

/** Heavier than any barbell lift a person is likely to log, in kg. */
const ABSOLUTE_LIMIT = 400;

/**
 * Checks a set about to be logged. `weight` and `heaviest` (the heaviest working set ever logged for
 * this exercise) are kg.
 */
export function checkSet(weight: number | null, reps: number, heaviest: number | undefined): SetProblem | null {
  if (!(reps > 0)) return { kind: 'noReps' };
  const w = weight ?? 0;
  if (heaviest && heaviest > 0) {
    // 50% and 20 kg over your best at once is a typo far more often than a breakthrough.
    if (w > Math.max(heaviest * 1.5, heaviest + 20)) return { kind: 'heavy', heaviest };
  } else if (w > ABSOLUTE_LIMIT) {
    return { kind: 'heavy' };
  }
  return null;
}

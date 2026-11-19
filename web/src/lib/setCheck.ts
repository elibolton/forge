// Catches sets that are almost certainly typos before they reach history, where a bogus number would
// show up as a personal record and push progression the wrong way.

export type SetProblem =
  | { kind: 'noReps' }
  /** Far heavier than anything logged before; `heaviest` is kg, absent with no history. */
  | { kind: 'heavy'; heaviest?: number }
  /** Far more reps than planned or ever logged (80 typed for 8); `usual` is the reps it was judged against. */
  | { kind: 'manyReps'; usual?: number };

/** Reps under this are never questioned: high-rep sets of 20–30 are normal. */
const REPS_FLOOR = 30;

/** Heavier than any barbell lift a person is likely to log, in kg. */
const ABSOLUTE_LIMIT = 400;

/**
 * Checks a set about to be logged. `weight` and `heaviest` (the heaviest working set ever logged for
 * this exercise) are kg. `reps` context: the planned reps and the most ever logged; timed work (reps are
 * seconds) skips the reps check.
 */
export function checkSet(
  weight: number | null, reps: number, heaviest: number | undefined,
  context: { targetReps?: number | null; mostReps?: number; isTimed?: boolean } = {},
): SetProblem | null {
  if (!(reps > 0)) return { kind: 'noReps' };
  if (!context.isTimed) {
    const usual = Math.max(context.targetReps ?? 0, context.mostReps ?? 0);
    // Twice the most you planned or ever did, and over 30: almost always an extra digit.
    if (reps > Math.max(REPS_FLOOR, usual * 2)) return { kind: 'manyReps', usual: usual || undefined };
  }
  const w = weight ?? 0;
  if (heaviest && heaviest > 0) {
    // 50% and 20 kg over your best at once is a typo far more often than a breakthrough.
    if (w > Math.max(heaviest * 1.5, heaviest + 20)) return { kind: 'heavy', heaviest };
  } else if (w > ABSOLUTE_LIMIT) {
    return { kind: 'heavy' };
  }
  return null;
}

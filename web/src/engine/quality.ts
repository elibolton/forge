import type { Exercise, Goal, Level, Muscle } from './models';

/**
 * How good an exercise is for a goal, and the attributes behind it. Sources and reasoning are in
 * reports/Evidence based workout building.md ("Exercise quality" and the algorithm spec, steps 18–22).
 */

/** The job an exercise does in a session; day templates are built from these. */
export const ROLES = [
  'pressFlat', 'pressIncline', 'dip', 'pressClose', 'chestFly', 'pressVertical', 'sideRaise', 'rearDelt', 'frontRaise',
  'tricepsOverhead', 'tricepsOther', 'curlLong', 'curl', 'curlShort', 'curlHammer', 'forearm',
  'verticalPull', 'row', 'latIso', 'shrug',
  'squatMain', 'unilateral', 'kneeExt', 'hinge', 'deadlift', 'legCurl', 'hipThrust', 'calf',
  'adduction', 'abduction', 'abs', 'core', 'carry', 'power', 'other',
] as const;
export type Role = (typeof ROLES)[number];

/** S best … C avoid as a main pick. */
export type Tier = 'S' | 'A' | 'B' | 'C';

export interface Quality {
  /** Tier for building muscle, strength, powerlifting and general fitness. */
  tiers: { hypertrophy: Tier; strength: Tier; powerlifting: Tier; general: Tier };
  /** 1–5: how hard it loads the muscle in a stretched position. */
  longLength: number;
  /** 1–5: machine 5, barbell 3–4, unilateral free weight 2–3. */
  stability: number;
  /** 1–5: how easy it is to add load over time. */
  overload: number;
  /** 1–5: whole-body fatigue (deadlift 5, machine isolation 1). */
  fatigue: number;
  /** 1–5: technique needed. */
  skill: number;
  /** 1–5: stress on joints. */
  jointStress: number;
  /** 1–5: carry-over to the squat, bench, deadlift and overhead press. */
  strengthTransfer: number;
  roles: Role[];
}

type Attrs = [longLength: number, stability: number, overload: number, fatigue: number, skill: number, joint: number, transfer: number];

function q(tiers: string, a: Attrs, ...roles: Role[]): Quality {
  const t = (i: number) => tiers[i] as Tier;
  return {
    tiers: { hypertrophy: t(0), strength: t(1), powerlifting: t(2), general: t(3) },
    longLength: a[0], stability: a[1], overload: a[2], fatigue: a[3], skill: a[4], jointStress: a[5], strengthTransfer: a[6],
    roles,
  };
}

// Tiers are hypertrophy / strength / powerlifting / general fitness.
// Attributes: long length, stability, overload, fatigue, skill, joint stress, strength transfer.
const ISO: Attrs = [2, 3, 3, 1, 1, 1, 1];

export const QUALITY: Record<string, Quality> = {
  // Chest
  'bb-bench': q('ASSA', [3, 4, 5, 3, 3, 3, 5], 'pressFlat'),
  'bb-incline-bench': q('AABA', [3, 4, 5, 3, 3, 3, 3], 'pressIncline'),
  'db-bench': q('ABCA', [4, 3, 4, 2, 2, 2, 2], 'pressFlat'),
  'db-incline-bench': q('SBCA', [4, 3, 4, 2, 2, 2, 2], 'pressIncline'),
  'machine-chest-press': q('SBCA', [3, 5, 5, 2, 1, 1, 1], 'pressFlat'),
  'smith-bench': q('ABCB', [3, 5, 5, 2, 1, 2, 2], 'pressFlat'),
  'push-up': q('BCCA', [3, 3, 2, 1, 1, 2, 1], 'pressFlat'),
  'dip': q('ABCA', [5, 3, 3, 2, 2, 3, 2], 'dip'),
  'weighted-dip': q('SACA', [5, 3, 5, 2, 2, 3, 3], 'dip'),
  'cable-fly': q('SCCB', [4, 4, 4, 1, 1, 1, 1], 'chestFly'),
  'db-fly': q('BCCB', [5, 3, 2, 1, 2, 3, 1], 'chestFly'),
  'db-decline-bench': q('BCCB', [3, 3, 4, 2, 2, 2, 2], 'pressFlat'),
  // Cuts off the stretched bottom of the press.
  'db-floor-press': q('CBCB', [1, 3, 4, 2, 1, 1, 2], 'pressFlat'),
  'incline-push-up': q('CCCB', [3, 3, 1, 1, 1, 2, 1], 'pressFlat'),
  'decline-push-up': q('BCCB', [3, 3, 2, 1, 1, 2, 1], 'pressIncline'),
  'knee-push-up': q('CCCB', [3, 3, 1, 1, 1, 1, 1], 'pressFlat'),
  'incline-svend-press': q('CCCC', [1, 3, 1, 1, 1, 1, 1], 'chestFly'),
  'band-chest-fly': q('CCCB', [2, 3, 2, 1, 1, 1, 1], 'chestFly'),
  'db-pullover': q('BCCB', [5, 3, 3, 1, 2, 3, 1], 'latIso'),

  // Shoulders
  'bb-ohp': q('ASAA', [3, 3, 5, 3, 4, 3, 5], 'pressVertical'),
  'db-shoulder-press': q('ABCA', [3, 3, 4, 2, 2, 2, 2], 'pressVertical'),
  'machine-shoulder-press': q('ABCA', [3, 5, 5, 2, 1, 1, 1], 'pressVertical'),
  'pike-push-up': q('CCCB', [3, 2, 2, 1, 2, 2, 1], 'pressVertical'),
  'arnold-press': q('BCCB', [3, 3, 4, 2, 2, 2, 1], 'pressVertical'),
  'seated-bb-ohp': q('BABB', [3, 4, 5, 3, 3, 3, 4], 'pressVertical'),
  'standing-db-shoulder-press': q('BBCA', [3, 2, 4, 2, 2, 2, 2], 'pressVertical'),
  'db-lateral-raise': q('SCCA', [2, 3, 3, 1, 1, 1, 1], 'sideRaise'),
  'cable-lateral-raise': q('SCCA', [4, 4, 4, 1, 1, 1, 1], 'sideRaise'),
  'leaning-db-lateral-raise': q('SCCA', [4, 3, 3, 1, 1, 1, 1], 'sideRaise'),
  'lateral-to-front-raise': q('BCCB', [2, 3, 3, 1, 2, 1, 1], 'sideRaise'),
  'db-upright-row': q('BCCB', [2, 3, 4, 1, 2, 3, 1], 'sideRaise'),
  'cable-upright-row': q('BCCB', [2, 4, 4, 1, 2, 3, 1], 'sideRaise'),
  'bb-upright-row': q('CCCC', [2, 3, 4, 2, 2, 4, 1], 'sideRaise'),
  'kb-upright-row': q('CCCC', [2, 3, 3, 1, 2, 3, 1], 'sideRaise'),
  'db-rear-delt-fly': q('ACCA', [3, 3, 3, 1, 1, 1, 1], 'rearDelt'),
  'face-pull': q('ACCA', [3, 4, 4, 1, 1, 1, 1], 'rearDelt'),
  'band-pull-apart': q('CCCB', [2, 3, 1, 1, 1, 1, 1], 'rearDelt'),
  // Front delts get plenty from pressing.
  'db-front-raise': q('CCCC', ISO, 'frontRaise'),
  'bb-front-raise': q('CCCC', ISO, 'frontRaise'),
  'plate-front-raise': q('CCCC', ISO, 'frontRaise'),

  // Biceps and forearms
  'incline-db-curl': q('SCCA', [5, 3, 3, 1, 1, 1, 1], 'curlLong'),
  'bb-curl': q('ABCA', [2, 3, 5, 1, 1, 2, 1], 'curl'),
  'ez-curl': q('ABCA', [2, 3, 5, 1, 1, 1, 1], 'curl'),
  'db-curl': q('ACCA', [2, 3, 4, 1, 1, 1, 1], 'curl'),
  'cable-curl': q('ACCA', [3, 4, 4, 1, 1, 1, 1], 'curl'),
  'seated-db-curl': q('ACCA', [2, 3, 4, 1, 1, 1, 1], 'curl'),
  'wide-grip-bb-curl': q('BCCB', [2, 3, 4, 1, 1, 2, 1], 'curl'),
  'band-curl': q('CCCB', [1, 3, 2, 1, 1, 1, 1], 'curl'),
  'ez-preacher-curl': q('SCCA', [4, 4, 4, 1, 1, 1, 1], 'curlShort'),
  'concentration-curl': q('ACCB', [2, 4, 3, 1, 1, 1, 1], 'curlShort'),
  'bb-drag-curl': q('BCCB', [1, 3, 4, 1, 2, 1, 1], 'curlShort'),
  'db-hammer-curl': q('ACCA', [2, 3, 4, 1, 1, 1, 1], 'curlHammer'),
  'cable-rope-hammer-curl': q('ACCA', [2, 4, 4, 1, 1, 1, 1], 'curlHammer'),
  'incline-hammer-curl': q('ACCB', [4, 3, 3, 1, 1, 1, 1], 'curlHammer'),
  'cross-body-hammer-curl': q('BCCB', [2, 3, 3, 1, 1, 1, 1], 'curlHammer'),
  // Forearm work, not a biceps pick.
  'bb-reverse-curl': q('CCCC', [2, 3, 3, 1, 1, 2, 1], 'forearm'),
  'wrist-curl': q('BCCC', ISO, 'forearm'),
  'dead-hang': q('CCCC', [3, 3, 1, 1, 1, 1, 1], 'forearm'),

  // Triceps
  'overhead-tricep-ext': q('SCCA', [5, 3, 4, 1, 1, 2, 1], 'tricepsOverhead'),
  'single-arm-tricep-ext': q('ACCA', [5, 3, 3, 1, 1, 2, 1], 'tricepsOverhead'),
  'cable-overhead-tricep-ext': q('SCCA', [5, 4, 4, 1, 1, 1, 1], 'tricepsOverhead'),
  'tricep-pushdown': q('ACCA', [2, 4, 4, 1, 1, 1, 1], 'tricepsOther'),
  'rope-tricep-ext': q('ACCA', [2, 4, 4, 1, 1, 1, 1], 'tricepsOther'),
  'skull-crusher': q('ACCA', [4, 3, 4, 1, 2, 3, 1], 'tricepsOther'),
  'db-skull-crusher': q('ACCA', [4, 3, 3, 1, 2, 2, 1], 'tricepsOther'),
  'db-kickback': q('BCCB', [1, 3, 3, 1, 1, 1, 1], 'tricepsOther'),
  'tate-press': q('CCCC', [2, 3, 2, 1, 2, 2, 1], 'tricepsOther'),
  'band-tricep-ext': q('CCCB', [2, 3, 1, 1, 1, 1, 1], 'tricepsOther'),
  'bench-dip': q('CCCB', [3, 3, 1, 1, 1, 4, 1], 'tricepsOther'),
  'close-grip-bench': q('BAAB', [3, 4, 5, 3, 2, 3, 4], 'pressClose'),
  'tricep-push-up': q('BCCB', [3, 3, 2, 1, 1, 2, 1], 'pressClose'),

  // Back
  'lat-pulldown': q('SBCA', [4, 4, 5, 1, 1, 1, 2], 'verticalPull'),
  'pull-up': q('AACA', [4, 3, 3, 2, 2, 2, 2], 'verticalPull'),
  'chin-up': q('AACA', [4, 3, 3, 2, 2, 2, 2], 'verticalPull'),
  'neutral-grip-pull-up': q('AACA', [4, 3, 3, 2, 2, 2, 2], 'verticalPull'),
  'reverse-grip-pulldown': q('ABCA', [4, 4, 5, 1, 1, 1, 2], 'verticalPull'),
  'v-bar-pulldown': q('ABCA', [4, 4, 5, 1, 1, 1, 2], 'verticalPull'),
  'single-arm-lat-pulldown': q('ACCA', [5, 4, 4, 1, 1, 1, 1], 'verticalPull', 'latIso'),
  'straight-arm-pulldown': q('ACCB', [4, 4, 4, 1, 1, 1, 1], 'latIso'),
  'cable-row': q('SBCA', [4, 4, 5, 1, 1, 1, 2], 'row'),
  'incline-db-row': q('SBCA', [4, 4, 4, 1, 1, 1, 2], 'row'),
  'db-row': q('SBCA', [4, 3, 4, 2, 1, 1, 2], 'row'),
  'bb-row': q('AABA', [3, 2, 5, 4, 3, 3, 3], 'row'),
  'db-bent-over-row': q('ABCA', [3, 2, 4, 3, 2, 2, 2], 'row'),
  'shotgun-row': q('ACCA', [3, 4, 4, 1, 1, 1, 1], 'row'),
  'wide-grip-cable-row': q('ACCA', [3, 4, 5, 1, 1, 1, 1], 'row'),
  'pendlay-row': q('BABB', [3, 2, 5, 4, 3, 3, 3], 'row'),
  'bb-reverse-row': q('BBCB', [3, 2, 5, 4, 3, 3, 2], 'row'),
  'kb-row': q('BCCB', [3, 3, 3, 2, 1, 1, 1], 'row'),
  'inverted-row': q('BCCA', [3, 3, 2, 1, 1, 1, 1], 'row'),
  'australian-chin-up': q('BCCB', [3, 3, 2, 1, 1, 1, 1], 'row'),
  'band-row': q('CCCB', [2, 3, 1, 1, 1, 1, 1], 'row'),
  'bb-shrug': q('ABCB', [2, 3, 5, 2, 1, 1, 2], 'shrug'),
  'db-shrug': q('ACCB', [2, 3, 4, 1, 1, 1, 1], 'shrug'),
  'scapular-pull-up': q('CCCC', [2, 3, 1, 1, 1, 1, 1], 'other'),
  'rack-pull': q('CBBC', [1, 3, 5, 4, 3, 3, 3], 'deadlift'),
  // Hard to load or progress.
  'superman': q('CCCC', [1, 3, 1, 1, 1, 1, 1], 'other'),
  'superman-hold': q('CCCC', [1, 3, 1, 1, 1, 1, 1], 'other'),
  'superman-scaption': q('CCCC', [1, 3, 1, 1, 1, 1, 1], 'other'),
  'back-extension': q('BCBA', [4, 3, 3, 2, 1, 2, 2], 'hinge'),

  // Quads
  'bb-squat': q('SSSA', [4, 3, 5, 4, 4, 3, 5], 'squatMain'),
  'leg-press': q('SBCA', [4, 5, 5, 2, 1, 2, 2], 'squatMain'),
  'bb-front-squat': q('AABA', [4, 3, 5, 4, 4, 3, 3], 'squatMain'),
  'smith-squat': q('ABCA', [4, 4, 5, 3, 1, 2, 2], 'squatMain'),
  'goblet-squat': q('BCCA', [4, 3, 2, 2, 1, 2, 1], 'squatMain'),
  'kb-goblet-squat': q('BCCA', [4, 3, 2, 2, 1, 2, 1], 'squatMain'),
  'db-squat': q('BCCA', [3, 3, 3, 2, 1, 2, 1], 'squatMain'),
  'air-squat': q('CCCB', [3, 3, 1, 1, 1, 1, 1], 'squatMain'),
  'band-squat': q('CCCB', [2, 3, 1, 1, 1, 1, 1], 'squatMain'),
  // Powerlifting variations: great for a meet, poor value for size.
  'pause-squat': q('CASB', [4, 3, 5, 4, 4, 3, 5], 'squatMain'),
  'pause-front-squat': q('CBAB', [4, 3, 4, 4, 4, 3, 3], 'squatMain'),
  'bulgarian-split-squat': q('SCCA', [5, 2, 4, 3, 2, 2, 2], 'unilateral'),
  'split-squat': q('ABCA', [5, 2, 4, 3, 2, 2, 2], 'unilateral'),
  'walking-lunge': q('ACCA', [4, 2, 3, 2, 2, 2, 2], 'unilateral'),
  'db-lunge': q('BCCA', [4, 2, 3, 2, 2, 2, 2], 'unilateral'),
  'bb-lunge': q('BBCB', [4, 2, 4, 3, 3, 2, 2], 'unilateral'),
  'step-up': q('BCCA', [3, 2, 3, 2, 2, 2, 1], 'unilateral'),
  'bw-lunge': q('CCCB', [4, 2, 1, 1, 1, 2, 1], 'unilateral'),
  'pulse-lunge': q('CCCC', [3, 2, 1, 1, 1, 2, 1], 'unilateral'),
  'leg-extension': q('SCCA', [3, 5, 5, 1, 1, 2, 1], 'kneeExt'),
  'sissy-squat': q('BCCB', [5, 3, 2, 1, 3, 3, 1], 'kneeExt'),

  // Hamstrings and glutes
  'bb-rdl': q('SAAA', [5, 3, 5, 3, 2, 2, 3], 'hinge'),
  'db-rdl': q('ABCA', [5, 3, 4, 2, 2, 2, 2], 'hinge'),
  'db-stiff-leg-deadlift': q('ABCA', [5, 3, 4, 2, 2, 2, 2], 'hinge'),
  'good-morning': q('BBBB', [5, 2, 4, 4, 3, 3, 2], 'hinge'),
  'stiff-leg-good-morning': q('BBBB', [5, 2, 4, 4, 3, 3, 2], 'hinge'),
  'bb-deadlift': q('BSSA', [3, 3, 5, 5, 4, 3, 5], 'deadlift'),
  'sumo-deadlift': q('CASB', [3, 3, 5, 5, 4, 3, 4], 'deadlift'),
  'trap-bar-deadlift': q('BABA', [3, 3, 5, 4, 2, 2, 3], 'deadlift'),
  'leg-curl': q('SCCA', [4, 5, 5, 1, 1, 1, 1], 'legCurl'),
  'prone-db-leg-curl': q('BCCA', [3, 3, 2, 1, 1, 1, 1], 'legCurl'),
  'nordic-curl': q('BCCB', [5, 3, 1, 2, 2, 3, 1], 'legCurl'),
  'hip-thrust': q('ABCA', [2, 4, 5, 2, 2, 1, 2], 'hipThrust'),
  'bb-glute-bridge': q('BBCB', [1, 4, 5, 2, 1, 1, 1], 'hipThrust'),
  'db-hip-thrust': q('BCCA', [2, 4, 3, 1, 1, 1, 1], 'hipThrust'),
  'db-glute-bridge': q('CCCB', [1, 4, 2, 1, 1, 1, 1], 'hipThrust'),
  'glute-bridge': q('CCCB', [1, 4, 1, 1, 1, 1, 1], 'hipThrust'),
  'bw-hip-thrust': q('CCCB', [2, 4, 1, 1, 1, 1, 1], 'hipThrust'),
  'elevated-hip-bridge': q('CCCB', [2, 4, 1, 1, 1, 1, 1], 'hipThrust'),
  'single-leg-glute-bridge': q('CCCB', [1, 3, 1, 1, 1, 1, 1], 'hipThrust'),
  'single-leg-hip-thrust': q('CCCB', [2, 3, 2, 1, 1, 1, 1], 'hipThrust'),
  'glute-kickback': q('CCCB', ISO, 'other'),
  'kb-swing': q('CCCA', [2, 3, 3, 2, 2, 2, 1], 'power'),
  'clean': q('CBBB', [1, 2, 4, 4, 5, 3, 2], 'power'),
  'hang-clean': q('CBBB', [1, 2, 4, 4, 5, 3, 2], 'power'),
  'power-clean': q('CBBB', [1, 2, 4, 4, 5, 3, 2], 'power'),
  'kb-sumo-high-pull': q('CCCB', [1, 3, 3, 2, 2, 2, 1], 'power'),
  'db-thruster': q('CCCA', [3, 2, 3, 3, 3, 2, 1], 'power'),
  'jump-squat': q('CCCB', [2, 2, 1, 2, 2, 3, 1], 'power'),

  // Calves, hips
  'standing-calf-raise': q('SCCA', [5, 4, 5, 1, 1, 1, 1], 'calf'),
  'bb-calf-raise': q('ACCA', [5, 3, 5, 1, 2, 1, 1], 'calf'),
  'db-calf-raise': q('ACCA', [5, 3, 3, 1, 1, 1, 1], 'calf'),
  'single-leg-db-calf-raise': q('ACCA', [5, 3, 3, 1, 1, 1, 1], 'calf'),
  'single-leg-calf-raise': q('ACCB', [5, 3, 2, 1, 1, 1, 1], 'calf'),
  'seated-db-calf-raise': q('BCCB', [4, 3, 3, 1, 1, 1, 1], 'calf'),
  'bw-calf-raise': q('BCCB', [5, 3, 1, 1, 1, 1, 1], 'calf'),
  'cable-hip-adduction': q('CCCC', [3, 4, 3, 1, 1, 1, 1], 'adduction'),
  'copenhagen-plank': q('CCCB', [3, 3, 1, 1, 2, 2, 1], 'adduction'),
  'side-lunge': q('CCCB', [4, 2, 1, 1, 1, 2, 1], 'adduction'),
  'cable-hip-abduction': q('CCCC', ISO, 'abduction'),
  'band-lateral-walk': q('CCCB', ISO, 'abduction'),
  'clamshell': q('CCCC', ISO, 'abduction'),
  'side-leg-raise': q('CCCC', ISO, 'abduction'),

  // Abs and core
  'cable-crunch': q('SCCA', [4, 4, 5, 1, 1, 1, 1], 'abs'),
  'decline-crunch': q('ACCA', [4, 4, 3, 1, 1, 1, 1], 'abs'),
  'ab-rollout': q('ACCA', [5, 3, 2, 1, 2, 2, 1], 'abs'),
  'crunch': q('BCCA', [3, 4, 2, 1, 1, 1, 1], 'abs'),
  'hanging-leg-raise': q('BCCA', [3, 3, 2, 1, 2, 1, 1], 'abs'),
  'vertical-leg-raise': q('BCCA', [3, 3, 2, 1, 1, 1, 1], 'abs'),
  'decline-reverse-crunch': q('BCCB', [3, 4, 2, 1, 1, 1, 1], 'abs'),
  'sit-up': q('CCCB', [3, 4, 1, 1, 1, 2, 1], 'abs'),
  'leg-raise': q('CCCB', [3, 4, 1, 1, 1, 2, 1], 'abs'),
  'bicycle-crunch': q('CCCB', ISO, 'abs'),
  'oblique-crunch': q('CCCB', ISO, 'abs'),
  'leg-pull-in': q('CCCB', ISO, 'abs'),
  'flutter-kick': q('CCCB', ISO, 'abs'),
  'scissor-kick': q('CCCB', ISO, 'abs'),
  'scissor-crossover-kick': q('CCCB', ISO, 'abs'),
  'russian-twist': q('CCCB', ISO, 'abs'),
  // Stability work, not size.
  'plank': q('CCCA', [1, 4, 1, 1, 1, 1, 1], 'core'),
  'dead-bug': q('CCCB', [1, 4, 1, 1, 1, 1, 1], 'core'),
  'mountain-climber': q('CCCB', ISO, 'core'),
  'bear-crawl': q('CCCB', ISO, 'core'),
  // Grip and conditioning, not a pull-day muscle builder.
  'farmer-carry': q('CBCA', [1, 3, 4, 3, 1, 1, 2], 'carry'),
};

/** A best guess for exercises without an entry (the user's custom ones). */
function inferred(e: Exercise): Quality {
  const has = (m: Muscle) => e.primary[0] === m;
  let role: Role = 'other';
  switch (e.pattern) {
    case 'horizontalPush': role = 'pressFlat'; break;
    case 'verticalPush': role = 'pressVertical'; break;
    case 'verticalPull': role = 'verticalPull'; break;
    case 'horizontalPull': role = 'row'; break;
    case 'squat': role = 'squatMain'; break;
    case 'lunge': role = 'unilateral'; break;
    case 'hinge': role = has('glutes') ? 'hipThrust' : 'hinge'; break;
    case 'core': role = 'abs'; break;
    case 'carry': role = 'carry'; break;
    case 'isolation':
      role = has('chest') ? 'chestFly' : has('shoulders') ? 'sideRaise' : has('biceps') ? 'curl'
        : has('triceps') ? 'tricepsOther' : has('lats') ? 'latIso' : has('upperBack') ? 'shrug'
        : has('quads') ? 'kneeExt' : has('hamstrings') ? 'legCurl' : has('calves') ? 'calf'
        : has('glutes') ? 'hipThrust' : has('abs') ? 'abs' : has('forearms') ? 'forearm' : 'other';
      break;
  }
  const bodyweight = e.starterOneRM === 0;
  return {
    tiers: { hypertrophy: 'B', strength: 'B', powerlifting: 'C', general: 'B' },
    longLength: 3, stability: 3, overload: bodyweight ? 2 : 4, fatigue: e.isCompound ? 2 : 1, skill: 2,
    jointStress: 2, strengthTransfer: e.isCompound ? 2 : 1, roles: [role],
  };
}

export function qualityOf(e: Exercise): Quality {
  return QUALITY[e.id] ?? inferred(e);
}

export type TierKey = keyof Quality['tiers'];

/** Which tier column a goal reads. Strength goals use their own column only for main lifts. */
export function tierKey(goal: Goal, mainLift: boolean): TierKey {
  if (mainLift && goal === 'powerlifting') return 'powerlifting';
  if (mainLift && goal === 'getStronger') return 'strength';
  return goal === 'improveFitness' ? 'general' : 'hypertrophy';
}

const TIER_BASE: Record<Tier, number> = { S: 100, A: 80, B: 55, C: 15 };

/**
 * Score from the attributes alone (spec step 20). Weights are design choices, tuned by inspection:
 * size goals reward stretch and stability and punish fatigue; strength goals reward carry-over.
 */
export function qualityScore(e: Exercise, goal: Goal, level: Level, mainLift: boolean): number {
  const qv = qualityOf(e);
  const key = tierKey(goal, mainLift);
  const strengthMain = key === 'strength' || key === 'powerlifting';
  const w = strengthMain
    ? { ll: 1, stab: 1, prog: 3, fat: key === 'powerlifting' ? 0 : 1, str: 6 }
    : key === 'general' ? { ll: 2, stab: 3, prog: 3, fat: 3, str: 0 } : { ll: 4, stab: 3, prog: 3, fat: 4, str: 0 };
  const skill = level === 'beginner' ? 4 : level === 'intermediate' ? 1 : 0;
  const stab = w.stab + (level === 'beginner' ? 2 : 0);
  return TIER_BASE[qv.tiers[key]] + w.ll * qv.longLength + stab * qv.stability + w.prog * qv.overload
    - w.fat * qv.fatigue - skill * qv.skill - 3 * Math.max(0, qv.jointStress - 2) + w.str * qv.strengthTransfer;
}

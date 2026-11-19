import type { DayFocus, Muscle } from './models';
import type { Role } from './quality';

/**
 * One place in a day's workout. The planner fills it with the best eligible exercise whose role
 * matches. See the algorithm spec, step 17, in reports/Evidence based workout building.md.
 */
export interface Slot {
  /** Acceptable roles, any order (the exercise score decides). */
  roles: Role[];
  /** The muscle whose set budget this slot serves. */
  muscle: Muscle;
  /** Required slots are filled first; optional ones only while a muscle still has room and time. */
  required: boolean;
  /** A main lift: strength goals pick it by their own tier and keep it stable week to week. */
  main?: boolean;
  /** Index of an earlier slot whose exercise role this one must not repeat (e.g. flat then incline). */
  differentFrom?: number;
  /** Added only when every muscle the day trains is done and time is left (rear delts, abs, calves). */
  extra?: boolean;
}

const R = (muscle: Muscle, roles: Role[], o: Partial<Slot> = {}): Slot => ({ roles, muscle, required: true, ...o });
const O = (muscle: Muscle, roles: Role[], o: Partial<Slot> = {}): Slot => ({ roles, muscle, required: false, ...o });
const X = (muscle: Muscle, roles: Role[]): Slot => ({ roles, muscle, required: false, extra: true });

const TEMPLATES: Record<Exclude<DayFocus, 'recovered'>, Slot[]> = {
  push: [
    R('chest', ['pressFlat', 'pressIncline'], { main: true }),
    R('chest', ['pressIncline', 'pressFlat', 'dip'], { differentFrom: 0 }),
    R('chest', ['chestFly', 'dip'], { differentFrom: 1 }),
    R('sideDelts', ['sideRaise']),
    R('triceps', ['tricepsOverhead']),
    O('triceps', ['tricepsOther']),
    O('sideDelts', ['sideRaise']),
    O('frontDelts', ['pressVertical']),
    X('rearDelts', ['rearDelt']), X('abs', ['abs']), X('calves', ['calf']),
  ],
  pull: [
    R('lats', ['verticalPull'], { main: true }),
    R('upperBack', ['row']),
    O('lats', ['latIso', 'verticalPull', 'row']),
    R('rearDelts', ['rearDelt']),
    R('biceps', ['curlLong', 'curl']),
    O('biceps', ['curlShort', 'curlHammer']),
    O('upperBack', ['shrug']),
    X('abs', ['abs']), X('calves', ['calf']),
  ],
  legs: [
    R('quads', ['squatMain'], { main: true }),
    R('hamstrings', ['hinge', 'deadlift'], { main: true }),
    R('quads', ['kneeExt']),
    O('hamstrings', ['legCurl']),
    R('calves', ['calf']),
    O('quads', ['unilateral']),
    O('glutes', ['hipThrust']),
    X('abs', ['abs']),
  ],
  lower: [
    R('hamstrings', ['hinge', 'deadlift'], { main: true }),
    R('quads', ['squatMain', 'unilateral'], { main: true }),
    R('hamstrings', ['legCurl']),
    O('quads', ['kneeExt']),
    R('calves', ['calf']),
    O('glutes', ['hipThrust']),
    O('abs', ['abs']),
  ],
  upper: [
    R('chest', ['pressFlat', 'pressIncline'], { main: true }),
    R('lats', ['verticalPull', 'row']),
    R('chest', ['pressIncline', 'pressFlat', 'dip'], { differentFrom: 0 }),
    R('upperBack', ['row', 'verticalPull'], { differentFrom: 1 }),
    R('sideDelts', ['sideRaise']),
    R('biceps', ['curlLong', 'curl']),
    R('triceps', ['tricepsOverhead']),
    O('rearDelts', ['rearDelt']),
    O('chest', ['chestFly']),
    O('biceps', ['curlShort', 'curlHammer']),
    O('triceps', ['tricepsOther']),
    X('abs', ['abs']), X('calves', ['calf']),
  ],
  fullBody: [
    R('quads', ['squatMain'], { main: true }),
    R('chest', ['pressFlat', 'pressIncline'], { main: true }),
    R('lats', ['verticalPull', 'row']),
    R('hamstrings', ['hinge', 'legCurl']),
    O('frontDelts', ['pressVertical', 'pressIncline'], { differentFrom: 1 }),
    O('upperBack', ['row', 'verticalPull'], { differentFrom: 2 }),
    O('sideDelts', ['sideRaise']),
    O('biceps', ['curlLong', 'curl']),
    O('triceps', ['tricepsOverhead', 'tricepsOther']),
    O('calves', ['calf']),
    O('abs', ['abs']),
  ],
};

/** Slots for each "Fresh Muscles" group; `differentFrom` is relative to the group's first slot. */
const GROUP_SLOTS: { muscles: Muscle[]; slots: Slot[] }[] = [
  { muscles: ['chest'], slots: [
    R('chest', ['pressFlat', 'pressIncline'], { main: true }),
    R('chest', ['pressIncline', 'pressFlat', 'dip'], { differentFrom: 0 }),
    O('chest', ['chestFly', 'dip'], { differentFrom: 1 }),
  ] },
  { muscles: ['lats', 'upperBack'], slots: [
    R('lats', ['verticalPull'], { main: true }), R('upperBack', ['row']), O('lats', ['latIso', 'verticalPull', 'row']),
  ] },
  { muscles: ['frontDelts', 'sideDelts', 'rearDelts'], slots: [
    R('frontDelts', ['pressVertical'], { main: true }), R('sideDelts', ['sideRaise']), R('rearDelts', ['rearDelt']),
  ] },
  { muscles: ['biceps', 'triceps'], slots: [
    R('biceps', ['curlLong', 'curl']), R('triceps', ['tricepsOverhead']),
    O('biceps', ['curlShort', 'curlHammer']), O('triceps', ['tricepsOther']),
  ] },
  { muscles: ['quads', 'glutes'], slots: [
    R('quads', ['squatMain'], { main: true }), R('quads', ['kneeExt']), O('quads', ['unilateral']),
  ] },
  { muscles: ['hamstrings', 'glutes'], slots: [
    R('hamstrings', ['hinge', 'deadlift'], { main: true }), R('hamstrings', ['legCurl']), O('glutes', ['hipThrust']),
  ] },
];

export function templateFor(focus: DayFocus, targets: Muscle[]): Slot[] {
  if (focus !== 'recovered') return TEMPLATES[focus];
  const out: Slot[] = [];
  const key = (ms: Muscle[]) => [...ms].sort().join(',');
  const chosen = new Set<string>();
  // The day's targets are the union of the freshest groups; rebuild them in that order.
  for (const g of GROUP_SLOTS) {
    if (!g.muscles.every((m) => targets.includes(m)) || chosen.has(key(g.muscles))) continue;
    chosen.add(key(g.muscles));
    const base = out.length;
    out.push(...g.slots.map((s) => (s.differentFrom === undefined ? s : { ...s, differentFrom: base + s.differentFrom })));
  }
  out.push(X('abs', ['abs']), X('calves', ['calf']));
  return out;
}

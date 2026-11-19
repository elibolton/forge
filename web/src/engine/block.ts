import { DAY_MS, type Goal, type Level, type WorkoutRecord, workingSets } from './models';
import { qualityOf } from './quality';
import { Catalog } from './catalog';
import { oneRM, plausibleLoad, setRIR } from './strength';

/**
 * Training blocks for generated workouts (research report, spec steps 30 and 34): five loading weeks
 * with effort rising week by week, then a deload week. A block is worked out from the workout history
 * (plus any check-in answers), so it needs no other saved state and gives the same answer every time:
 *
 * - The first workout, or the first after 14+ days off, starts a block (time off is a deload of its own).
 * - At the start of each loading week from week 3 on, if estimated maxes fell on 2+ lifts over their
 *   last two sessions, that week becomes an early deload and the block ends after it.
 * - From the last planned loading week (week 5), an optional check-in can stretch the block a week at a
 *   time up to 7 loading weeks, or bring the deload forward (see `decideBlock`). Without answers the
 *   block is exactly 5 + 1 weeks, as before.
 */

export const LOADING_WEEKS = 5;
/** The most loading weeks a block can stretch to with good check-ins (spec step 34: "extendable to 7"). */
export const MAX_LOADING_WEEKS = 7;
export const BLOCK_WEEKS = LOADING_WEEKS + 1;
const BREAK = 14 * DAY_MS;

export interface BlockStatus {
  /** 1 for the first block. */
  number: number;
  /** 1-based week within the block. */
  week: number;
  /** Weeks in this block, including the deload. */
  weeks: number;
  isDeload: boolean;
  startedAt: number;
  /** Why the deload came early, if it did. */
  earlyReason?: string;
  /**
   * What the check-ins did to this block, for the Today screen: "Extended: you're recovering well" or
   * "Deload early: joints flagged". Unset when they changed nothing.
   */
  checkInNote?: string;
  /** Loading weeks the check-ins added beyond the default 5. */
  extendedBy?: number;
}

// MARK: - Check-in

/**
 * Answers to the end-of-block check-in. The first three questions are the program check-in's
 * (`FatigueCheckIn`), so the two feel the same; the fourth asks whether lifts are still going up.
 * Each `true` is a bad answer.
 */
export interface BlockCheckIn {
  jointPain: boolean;
  stillSore: boolean;
  poorSleepOrMotivation: boolean;
  /** Lifts have stopped going up, or gone down. */
  stalled: boolean;
  /** When it was answered: a deload chosen after training that week waits until the week ends. */
  answeredAt: number;
  /** Dismissed without answering: the block keeps its plan. */
  skipped?: boolean;
}

/** Block start (`BlockStatus.startedAt`, as a string) → loading week → answers. */
export type BlockCheckIns = Record<string, Record<number, BlockCheckIn>>;

export type BlockAction = 'extend' | 'deload' | 'keep';

export interface BlockDecision {
  action: BlockAction;
  /** Short, for the Today screen: "Extended: you're recovering well", "Deload early: joints flagged". */
  reason?: string;
  /** For a deload: what was flagged ("joints", "soreness and stalled lifts"). */
  flagged?: string;
}

const FLAG_NAMES: [keyof BlockCheckIn, string][] = [
  ['stillSore', 'soreness'], ['poorSleepOrMotivation', 'low energy'], ['stalled', 'stalled lifts'],
];

/** "a, b and c". */
const listText = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');

/** The poor signals in a check-in (joints are judged on their own), plus falling maxes from the logs. */
export function checkInFlagNames(c: BlockCheckIn, fallingCount: number): string[] {
  const out = FLAG_NAMES.filter(([k]) => c[k] === true).map(([, name]) => name);
  if (fallingCount > 0) out.push('falling maxes');
  return out;
}

/**
 * What a check-in does to the block. Pure: the answers, how many lifts' estimated maxes are falling
 * (`fallingLifts`, the same e1RM trend behind the early deload), and the loading weeks the block has now.
 *
 * The rule, conservative on purpose:
 * - No answers, or skipped: keep the plan (exactly the behaviour without check-ins).
 * - Any joint pain: deload. Pain is the one signal not worth training through.
 * - Two or more poor signals (soreness, poor sleep or motivation, lifts stalled, and the logs showing
 *   any lift's estimated max falling): deload. The same "2+ flags" threshold as the program check-in.
 * - Every answer good and no lift's estimated max falling: extend one week, up to 7 loading weeks.
 * - Anything in between (one poor signal, or already at 7 weeks): keep the plan.
 *
 * Evidence (reports/Evidence based workout building.md, "Deloads" and spec step 34, graded E-L): coaches
 * deload about every 5.6 ± 2.3 weeks, a practice norm rather than a tested optimum (Rogerson 2024; Bell
 * 2023 Delphi). The spec turns that into 5 loading weeks + 1 deload, "extendable to 7 loading weeks if
 * no fatigue flags", with early deloads on e1RM falling on 2+ lifts, rising soreness or joint pain, or
 * 2+ user-reported fatigue flags. Time off hurt strength gains (Coleman 2024), which argues against
 * deloading when nothing says it's needed; the low evidence grade argues for extending only when every
 * signal is good.
 */
export function decideBlock(c: BlockCheckIn | undefined, fallingCount: number, loadingWeeks: number): BlockDecision {
  if (!c || c.skipped) return { action: 'keep' };
  if (c.jointPain) return { action: 'deload', reason: 'Deload early: joints flagged', flagged: 'joints' };
  const flags = checkInFlagNames(c, fallingCount);
  if (flags.length >= 2) return { action: 'deload', reason: `Deload early: ${listText(flags)} flagged`, flagged: listText(flags) };
  if (flags.length === 0 && loadingWeeks < MAX_LOADING_WEEKS) return { action: 'extend', reason: "Extended: you're recovering well" };
  return { action: 'keep' };
}

/** The week a check-in is due in, if one is due: the last planned loading week, from week 5 on, until answered or skipped. */
export function blockCheckInDue(block: BlockStatus, checkIns: BlockCheckIns | undefined): number | undefined {
  if (block.isDeload || block.week < LOADING_WEEKS || block.week > MAX_LOADING_WEEKS || block.week !== block.weeks - 1) return undefined;
  return checkIns?.[String(block.startedAt)]?.[block.week] ? undefined : block.week;
}

// MARK: - Blocks

const dayStart = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * The local midnight `k` weeks after `start` (itself a local midnight). Counting calendar days rather
 * than adding 7 × 24 h keeps week boundaries at midnight across daylight-saving changes.
 */
const weeksAfter = (start: number, k: number) => {
  const d = new Date(start);
  d.setDate(d.getDate() + 7 * k);
  return d.getTime();
};

/** When week `week` of a block that started at `startedAt` begins. */
export const blockWeekStart = (startedAt: number, week: number) => weeksAfter(startedAt, week - 1);

/** Whole weeks from `start` (a local midnight) to `t`, by calendar days. */
const weeksSince = (start: number, t: number) => Math.floor(Math.round((dayStart(t) - start) / DAY_MS) / 7);

/** Best e1RM per session for each compound lift, oldest first. */
function exposures(records: WorkoutRecord[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const r of records) {
    for (const l of r.exercises) {
      const e = Catalog.byID.get(l.exerciseID);
      if (!e?.isCompound || qualityOf(e).overload < 4) continue;
      const best = Math.max(0, ...workingSets(l).filter((s) => plausibleLoad(s.weight)).map((s) => oneRM(s.weight, s.reps, setRIR(s, l.targetRIR))));
      if (best > 0) out.set(l.exerciseID, [...(out.get(l.exerciseID) ?? []), best]);
    }
  }
  return out;
}

/** Lifts whose estimated max fell across their last two sessions (spec step 34). */
export function fallingLifts(records: WorkoutRecord[]): string[] {
  const falling: string[] = [];
  for (const [id, xs] of exposures(records)) {
    if (xs.length < 3) continue;
    const [a, b, c] = xs.slice(-3);
    if (c <= b && c < a * 0.98) falling.push(id);
  }
  return falling.sort();
}

/**
 * Walks a history (oldest first) one record at a time, keeping the block it's in. `blockStatus` feeds
 * it the records up to a date; `deloadDates` feeds it the whole history once and notes each record's week.
 */
function blockWalker(records: WorkoutRecord[], checkIns?: BlockCheckIns) {
  let start: number | undefined;
  let number = 0;
  /** Planned loading weeks; good check-ins stretch it, up to 7. */
  let loading = LOADING_WEEKS;
  /** The week an early deload was set for, if one was. */
  let deloadAt: number | undefined;
  let earlyReason: string | undefined;
  let checkInNote: string | undefined;
  let checked = 1;
  let prev: number | undefined;
  let fed = 0;

  const weeks = () => deloadAt ?? loading + 1;
  const reset = () => { loading = LOADING_WEEKS; deloadAt = undefined; earlyReason = undefined; checkInNote = undefined; checked = 1; };
  const begin = (t: number) => { start = dayStart(t); number++; reset(); };

  /** At the start of loading week `k`: the e1RM early deload, then that week's check-in. */
  const enterWeek = (k: number) => {
    if (k < 3) return;
    const boundary = weeksAfter(start!, k - 1);
    // Only records already fed can be before the boundary (boundary <= t), so this is the same
    // set blockStatus would see when cut off at any later date.
    const falling = fallingLifts(records.slice(0, fed).filter((r) => r.date >= start! && r.date < boundary));
    if (falling.length >= 2) {
      deloadAt = k;
      earlyReason = `Estimated maxes dropped on ${falling.length} lifts`;
      return;
    }
    if (k !== loading) return;
    const answer = checkIns?.[String(start)]?.[k];
    const d = decideBlock(answer, falling.length, loading);
    if (d.action === 'extend') {
      loading = k + 1;
      checkInNote = d.reason;
    } else if (d.action === 'deload' && answer) {
      // Like the program check-in: nothing trained yet this week, so the deload starts now. Otherwise
      // it follows this week, which is when it was due anyway.
      const trained = records.some((r) => r.date >= boundary && r.date < answer.answeredAt);
      if (!trained) {
        deloadAt = k;
        earlyReason = `Your check-in flagged ${d.flagged}`;
        checkInNote = d.reason;
      }
    }
  };

  /** Moves the block forward to cover `t`, checking for early deloads and extensions at each week boundary. */
  const advance = (t: number) => {
    for (let guard = 0; guard < 1000 && start !== undefined; guard++) {
      // Week k starts at start + (k-1) weeks.
      while (deloadAt === undefined && checked < loading && t >= weeksAfter(start, checked)) {
        checked++;
        enterWeek(checked);
      }
      const end = weeksAfter(start, weeks());
      if (t < end) return;
      start = end; number++; reset();
    }
  };

  return {
    /** Feeds the next record (records must be fed in order). */
    feed(r: WorkoutRecord) {
      fed++;
      if (start === undefined || (prev !== undefined && r.date - prev > BREAK)) begin(r.date);
      else advance(r.date);
      prev = r.date;
    },
    /** The block at `now`, which must be at or after the last record fed. */
    at(now: number): BlockStatus {
      if (start === undefined || (prev !== undefined && now - prev > BREAK)) begin(now);
      else advance(now);
      const total = weeks();
      const week = Math.min(total, weeksSince(start!, now) + 1);
      return {
        number, week, weeks: total, isDeload: week === total, startedAt: start!,
        ...(earlyReason ? { earlyReason } : {}),
        ...(checkInNote ? { checkInNote } : {}),
        ...(total - 1 > LOADING_WEEKS ? { extendedBy: total - 1 - LOADING_WEEKS } : {}),
      };
    },
  };
}

/** Where `now` sits in its training block. `checkIns` are the end-of-block answers; without them, 5 + 1 weeks. */
export function blockStatus(history: WorkoutRecord[], now: number, checkIns?: BlockCheckIns): BlockStatus {
  const records = history.filter((r) => r.date <= now).sort((a, b) => a.date - b.date);
  const walker = blockWalker(records, checkIns);
  for (const r of records) walker.feed(r);
  return walker.at(now);
}

const deloadCache = new WeakMap<readonly WorkoutRecord[], { checkIns?: BlockCheckIns; dates: Set<number> }>();

/**
 * Dates of the workouts in `history` that fell in a deload week: the same answer as
 * `blockStatus(history, r.date, checkIns).isDeload` for every record, in one pass. Cached per history
 * array and check-ins object, so treat both as immutable (the app's are fresh objects on every change).
 */
export function deloadDates(history: readonly WorkoutRecord[], checkIns?: BlockCheckIns): Set<number> {
  const cached = deloadCache.get(history);
  if (cached && cached.checkIns === checkIns) return cached.dates;
  const out = new Set<number>();
  const records = [...history].sort((a, b) => a.date - b.date);
  const walker = blockWalker(records, checkIns);
  for (const r of records) {
    walker.feed(r);
    // A record never starts a 14-day break from itself, so `at` only advances to its own date here.
    if (walker.at(r.date).isDeload) out.add(r.date);
  }
  deloadCache.set(history, { checkIns, dates: out });
  return out;
}

/**
 * Reps in reserve for a block week (spec step 30): effort rises through the block, isolation work
 * runs a rep closer to failure than compounds, beginners keep an extra rep, and deloads stay easy.
 * Weeks added by a check-in hold week 5's effort.
 */
export function blockRIR(goal: Goal, level: Level, block: BlockStatus, compound: boolean): number {
  if (block.isDeload) return compound ? 4 : 3;
  const w = Math.min(block.week, LOADING_WEEKS) - 1;
  let rir: number;
  switch (goal) {
    case 'buildMuscle': case 'getLean':
      rir = (compound ? [3, 2, 2, 1, 1] : [2, 1, 1, 1, 0])[w]; break;
    case 'getStronger': case 'powerlifting':
      rir = (compound ? [3, 2, 2, 2, 1] : [2, 2, 1, 1, 1])[w]; break;
    case 'improveFitness': case 'reduceBodyweight':
      rir = [3, 3, 2, 2, 2][w]; break;
  }
  return rir + (level === 'beginner' ? 1 : 0);
}

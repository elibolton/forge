import { DAY_MS, type Goal, type Level, type WorkoutRecord, workingSets } from './models';
import { qualityOf } from './quality';
import { Catalog } from './catalog';
import { oneRM } from './strength';

/**
 * Training blocks for generated workouts (research report, spec steps 30 and 34): five loading weeks
 * with effort rising week by week, then a deload week. A block is worked out from the workout history
 * alone, so it needs no saved state and gives the same answer every time:
 *
 * - The first workout, or the first after 14+ days off, starts a block (time off is a deload of its own).
 * - At the start of weeks 3–5, if estimated maxes fell on 2+ lifts over their last two sessions, that
 *   week becomes an early deload and the block ends after it.
 */

export const LOADING_WEEKS = 5;
export const BLOCK_WEEKS = LOADING_WEEKS + 1;
const WEEK = 7 * DAY_MS;
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
}

const dayStart = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Best e1RM per session for each compound lift, oldest first. */
function exposures(records: WorkoutRecord[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const r of records) {
    for (const l of r.exercises) {
      const e = Catalog.byID.get(l.exerciseID);
      if (!e?.isCompound || qualityOf(e).overload < 4) continue;
      const best = Math.max(0, ...workingSets(l).filter((s) => s.weight > 0).map((s) => oneRM(s.weight, s.reps, s.rir)));
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
function blockWalker(records: WorkoutRecord[]) {
  let start: number | undefined;
  let number = 0;
  let weeks = BLOCK_WEEKS;
  let earlyReason: string | undefined;
  let checked = 1;
  let prev: number | undefined;
  let fed = 0;

  const begin = (t: number) => { start = dayStart(t); number++; weeks = BLOCK_WEEKS; earlyReason = undefined; checked = 1; };

  /** Moves the block forward to cover `t`, checking for early deloads at each week boundary. */
  const advance = (t: number) => {
    for (let guard = 0; guard < 1000 && start !== undefined; guard++) {
      // Week k starts at start + (k-1) weeks; decide early deloads at the start of weeks 3–5.
      while (weeks === BLOCK_WEEKS && checked < LOADING_WEEKS && t >= start + checked * WEEK) {
        checked++;
        if (checked < 3) continue;
        const boundary = start + (checked - 1) * WEEK;
        // Only records already fed can be before the boundary (boundary <= t), so this is the same
        // set blockStatus would see when cut off at any later date.
        const falling = fallingLifts(records.slice(0, fed).filter((r) => r.date >= start! && r.date < boundary));
        if (falling.length >= 2) {
          weeks = checked;
          earlyReason = `Estimated maxes dropped on ${falling.length} lifts`;
        }
      }
      const end = start + weeks * WEEK;
      if (t < end) return;
      start = end; number++; weeks = BLOCK_WEEKS; earlyReason = undefined; checked = 1;
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
      const week = Math.min(weeks, Math.floor((now - start!) / WEEK) + 1);
      return { number, week, weeks, isDeload: week === weeks, startedAt: start!, ...(earlyReason ? { earlyReason } : {}) };
    },
  };
}

export function blockStatus(history: WorkoutRecord[], now: number): BlockStatus {
  const records = history.filter((r) => r.date <= now).sort((a, b) => a.date - b.date);
  const walker = blockWalker(records);
  for (const r of records) walker.feed(r);
  return walker.at(now);
}

const deloadCache = new WeakMap<readonly WorkoutRecord[], Set<number>>();

/**
 * Dates of the workouts in `history` that fell in a deload week: the same answer as
 * `blockStatus(history, r.date).isDeload` for every record, in one pass. Cached per history array,
 * so treat the array as immutable (the app's history is a fresh derived array on every change).
 */
export function deloadDates(history: readonly WorkoutRecord[]): Set<number> {
  let out = deloadCache.get(history);
  if (out) return out;
  out = new Set<number>();
  const records = [...history].sort((a, b) => a.date - b.date);
  const walker = blockWalker(records);
  for (const r of records) {
    walker.feed(r);
    // A record never starts a 14-day break from itself, so `at` only advances to its own date here.
    if (walker.at(r.date).isDeload) out.add(r.date);
  }
  deloadCache.set(history, out);
  return out;
}

/**
 * Reps in reserve for a block week (spec step 30): effort rises through the block, isolation work
 * runs a rep closer to failure than compounds, beginners keep an extra rep, and deloads stay easy.
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

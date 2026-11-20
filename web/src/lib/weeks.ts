// Calendar weeks run Monday to Sunday, in local time.

import { type WorkoutProgram, dayOrder } from '../engine';

export const DAY = 86_400_000;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 of the week containing `t`. */
export function weekStart(t: number): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Monday of the week before, safe across daylight-saving changes. */
export const previousWeek = (monday: number) => weekStart(monday - 3 * DAY);

export function countInWeek(dates: number[], monday: number): number {
  const next = weekStart(monday + 8 * DAY);
  return dates.filter((d) => d >= monday && d < next).length;
}

/** Which days of this week (Monday first) had a workout. */
export function trainedDays(dates: number[], now = Date.now()): boolean[] {
  const monday = weekStart(now);
  const out = Array(7).fill(false) as boolean[];
  for (const d of dates) {
    if (weekStart(d) !== monday) continue;
    out[(new Date(d).getDay() + 6) % 7] = true;
  }
  return out;
}

/** The weekly goal for the week starting `monday`. */
export type GoalSchedule = (monday: number) => number;

/**
 * Consecutive weeks that met the goal. This week counts once it's met; until then the streak is
 * still alive from last week, so it doesn't look broken on a Monday morning.
 */
export function goalStreak(dates: number[], goal: number | GoalSchedule, now = Date.now()): number {
  const goalOn = typeof goal === 'number' ? () => goal : goal;
  let week = weekStart(now);
  if (countInWeek(dates, week) < goalOn(week)) week = previousWeek(week);
  let streak = 0;
  // Each week is judged against the goal in force then (a program started since doesn't count against it).
  for (let guard = 0; guard < 2000 && countInWeek(dates, week) >= goalOn(week); guard++) {
    streak++;
    week = previousWeek(week);
  }
  return streak;
}

/** Workouts in each of the last `n` weeks, oldest first. */
export function weeklyCounts(dates: number[], n: number, now = Date.now()): number[] {
  const weeks: number[] = [];
  let week = weekStart(now);
  for (let i = 0; i < n; i++) { weeks.unshift(week); week = previousWeek(week); }
  return weeks.map((w) => countInWeek(dates, w));
}

/**
 * Workouts a week to aim for: a running program's training days (its schedule is the plan), else
 * the goal set in You.
 */
export function weeklyGoalFor(profileGoal: number, program?: WorkoutProgram | null): number {
  const days = program ? dayOrder(program).length : 0;
  return days > 0 ? days : profileGoal;
}

/**
 * The goal each week was judged against: a running program's days from the week after it started,
 * the profile's goal before then (and in the week it started, already part-trained under that goal).
 * Starting a 5-day program then doesn't break a streak built on 3 a week.
 */
export function weeklyGoalSchedule(profileGoal: number, program?: WorkoutProgram | null, startedAt?: number): GoalSchedule {
  const current = weeklyGoalFor(profileGoal, program);
  if (!program || startedAt === undefined || current === profileGoal) return () => current;
  const first = weekStart(startedAt);
  return (monday) => (monday <= first ? profileGoal : current);
}

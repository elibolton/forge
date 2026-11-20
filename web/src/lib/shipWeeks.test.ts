// N11 (docs/ship-audit/bugs.md): starting a program doesn't reset the weekly streak.
import { describe, expect, test } from 'vitest';
import { Programs, dayOrder } from '../engine';
import { DAY, goalStreak, weekStart, weeklyGoalSchedule } from './weeks';

describe('N11: weekly streak across a program start', () => {
  // A Wednesday noon, local time.
  const monday = weekStart(new Date(2026, 10, 16, 12).getTime());
  const now = monday + 2 * DAY + 12 * 3600_000;
  const program = Programs.pplul8;
  const days = dayOrder(program).length;

  /** 3 workouts (Mon, Wed, Fri) in each of the 10 weeks before this one. */
  const dates: number[] = [];
  for (let w = 1; w <= 10; w++) {
    const m = weekStart(monday - w * 7 * DAY + DAY);
    for (const d of [0, 2, 4]) dates.push(m + d * DAY + 18 * 3600_000);
  }

  test('ten weeks at 3 a week, then a program starts today: still a 10-week streak', () => {
    expect(days).toBeGreaterThan(3);
    expect(goalStreak(dates, 3, now)).toBe(10);
    // The old behaviour: the program's goal applied to every past week.
    expect(goalStreak(dates, days, now)).toBe(0);
    expect(goalStreak(dates, weeklyGoalSchedule(3, program, now), now)).toBe(10);
  });

  test('weeks after the program started are judged against its days', () => {
    const started = monday - 14 * DAY + DAY;
    const schedule = weeklyGoalSchedule(3, program, started);
    expect(schedule(weekStart(started))).toBe(3);
    expect(schedule(weekStart(started) + 7 * DAY)).toBe(days);
    // The last full week (after the start week) only had 3: the streak ends there.
    expect(goalStreak(dates, schedule, now)).toBe(0);
  });

  test('no program: the profile goal for every week', () => {
    expect(weeklyGoalSchedule(4, null)(monday)).toBe(4);
    expect(goalStreak(dates, weeklyGoalSchedule(3, null), now)).toBe(10);
  });
});

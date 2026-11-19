// Calendar weeks run Monday to Sunday, in local time.

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

/**
 * Consecutive weeks that met the goal. This week counts once it's met; until then the streak is
 * still alive from last week, so it doesn't look broken on a Monday morning.
 */
export function goalStreak(dates: number[], goal: number, now = Date.now()): number {
  let week = weekStart(now);
  if (countInWeek(dates, week) < goal) week = previousWeek(week);
  let streak = 0;
  while (countInWeek(dates, week) >= goal) {
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

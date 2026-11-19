import { DAY } from './weeks';

/** One weigh-in, in kg. */
export interface BodyweightEntry { id: string; date: number; kg: number }

export function readBodyweight(v: unknown): BodyweightEntry | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.date !== 'number' || typeof o.kg !== 'number' || !(o.kg > 20 && o.kg < 400)) return undefined;
  return { id: o.id, date: o.date, kg: o.kg };
}

/**
 * Latest weight and how it moved: against the weigh-in nearest 30 days back (at least a week old),
 * so a single noisy morning doesn't read as a trend. Entries can be in any order.
 */
export function bodyweightTrend(entries: BodyweightEntry[], now = Date.now()) {
  const sorted = [...entries].sort((a, b) => b.date - a.date);
  const latest = sorted[0];
  if (!latest) return undefined;
  const older = sorted.filter((e) => latest.date - e.date >= 7 * DAY);
  const base = older.length
    ? older.reduce((best, e) => (Math.abs(now - 30 * DAY - e.date) < Math.abs(now - 30 * DAY - best.date) ? e : best))
    : undefined;
  return { latest, change: base ? latest.kg - base.kg : undefined, since: base?.date };
}

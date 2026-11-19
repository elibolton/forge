import { POUNDS_PER_KG } from '../engine';

/** Engine works in kg; this converts for display and input. */
export class WeightUnits {
  constructor(public pounds: boolean) {}

  get symbol() { return this.pounds ? 'lb' : 'kg'; }

  /**
   * A kg value in the display unit, to the hundredth: enough for 1.25 kg microplates, 0.1 kg weigh-ins
   * and typed loads to show as saved, while clearing the noise a kg to lb round trip leaves.
   */
  display(kg: number): number {
    const v = this.pounds ? kg * POUNDS_PER_KG : kg;
    return Math.round(v * 100) / 100;
  }

  kg(display: number): number { return this.pounds ? display / POUNDS_PER_KG : display; }

  format(kg: number | null | undefined): string {
    if (!kg || kg <= 0) return 'BW';
    const v = this.display(kg);
    // Loads to the hundredth (61.25 kg); totals in the thousands (volume) to the whole unit.
    return `${fmtNum(v, v >= 1000 ? 0 : 2)} ${this.symbol}`;
  }

  /** An estimate (e1RM), to one decimal: "164.67 lb" claims a precision a formula doesn't have. */
  estimate(kg: number | null | undefined): string {
    if (!kg || kg <= 0) return '–';
    return `${fmtNum(this.display(kg), 1)} ${this.symbol}`;
  }
}

/** Up to one decimal, no trailing zero. */
export function fmtNum(v: number, decimals = 1): string {
  const f = 10 ** decimals;
  const r = Math.round(v * f) / f;
  return Number.isInteger(r) ? r.toLocaleString() : r.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/** A workout's length in whole minutes, or "<1 min" for one under a minute (never "0 min"). */
export function durationText(seconds: number): string {
  const s = Math.max(0, seconds);
  return s < 60 ? '<1 min' : `${Math.floor(s / 60)} min`;
}

/** m:ss, or h:mm:ss from an hour up. */
export function minSec(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const ss = String(s % 60).padStart(2, '0');
  if (s < 3600) return `${Math.floor(s / 60)}:${ss}`;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${ss}`;
}

export function isSameDay(a: number, b: number): boolean {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** Upper bounds on typed numbers, so a slipped digit (1000 for 100) can't be saved as a set or activity. */
export const maxWeight = (pounds: boolean) => (pounds ? 1100 : 500);
/** Reps per set, or seconds for a timed hold. */
export const maxReps = (timed: boolean) => (timed ? 3600 : 100);
export const MAX_MINUTES = 600;

/** A time as the value of a datetime-local input (local time, to the minute). */
export function toLocalInput(t: number): string {
  const d = new Date(t);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * The time a datetime-local input now holds, for a value that started as `original`. The input only
 * keeps minutes, so an unchanged minute gives back `original` with its seconds, not a changed time.
 */
export function fromLocalInput(input: string, original: number): number {
  const t = new Date(input).getTime();
  if (!Number.isFinite(t) || input === toLocalInput(original)) return original;
  return t;
}

export function dayKey(t = Date.now()): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

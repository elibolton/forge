import { POUNDS_PER_KG } from '../engine';

/** Engine works in kg; this converts for display and input. */
export class WeightUnits {
  constructor(public pounds: boolean) {}

  get symbol() { return this.pounds ? 'lb' : 'kg'; }

  display(kg: number): number {
    const v = this.pounds ? kg * POUNDS_PER_KG : kg;
    return Math.round(v * 2) / 2;
  }

  kg(display: number): number { return this.pounds ? display / POUNDS_PER_KG : display; }

  format(kg: number | null | undefined): string {
    if (!kg || kg <= 0) return 'BW';
    return `${fmtNum(this.display(kg))} ${this.symbol}`;
  }
}

/** Up to one decimal, no trailing zero. */
export function fmtNum(v: number, decimals = 1): string {
  const f = 10 ** decimals;
  const r = Math.round(v * f) / f;
  return Number.isInteger(r) ? r.toLocaleString() : r.toLocaleString(undefined, { maximumFractionDigits: decimals });
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

export function dayKey(t = Date.now()): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

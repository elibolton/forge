<script lang="ts">
  import type { PlateStock } from '../engine';
  import { platesPerSide } from '../lib/plates';
  import { fmtNum } from '../lib/units';

  /** What to put on each side of the bar, drawn as a little loaded sleeve. `plates`: the gym's own; unset uses the standard set. */
  let { total, bar, pounds, plates }: { total: number; bar: number; pounds: boolean; plates?: PlateStock[] } = $props();
  const result = $derived(platesPerSide(total, bar, pounds, plates));
  const biggest = $derived(Math.max(pounds ? 45 : 25, ...(plates ?? []).map((p) => p.weight)));
  const text = $derived(result.plates.length ? grouped(result.plates) : 'Empty bar');
  /** Drawn plates; past this many the sleeve would crowd out the text. */
  const MAX_DRAWN = 8;

  /** "25 × 4 + 10" rather than "25 + 25 + 25 + 25 + 10". */
  function grouped(plates: number[]): string {
    const out: string[] = [];
    for (let i = 0; i < plates.length;) {
      let j = i;
      while (plates[j] === plates[i]) j++;
      out.push(j - i > 1 ? `${fmtNum(plates[i], 2)} × ${j - i}` : fmtNum(plates[i], 2));
      i = j;
    }
    return out.join(' + ');
  }
</script>

<div class="plates" aria-label="Per side: {text}{result.remainder ? `, plus ${fmtNum(result.remainder, 2)} you can't make with plates` : ''}">
  <div class="sleeve" aria-hidden="true">
    <span class="collar"></span>
    {#each result.plates.slice(0, MAX_DRAWN) as p, i (i)}<span class="plate" style="height:{10 + (p / biggest) * 26}px;--w:{p >= biggest * 0.5 ? 7 : 5}px"></span>{/each}
    <span class="bar-end"></span>
  </div>
  <div class="stack grow" style="--gap:2px;min-width:0">
    <span class="eyebrow">Each side</span>
    <span class="sub semibold mono">{text}</span>
  </div>
  <span class="caption faint bar-note">{fmtNum(bar)} {pounds ? 'lb' : 'kg'} bar{result.remainder ? ` · ${fmtNum(result.remainder, 2)} off` : ''}</span>
</div>

<style>
  .plates { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 16px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--hairline); }
  .sleeve { flex: none; display: flex; align-items: center; gap: 2px; min-width: 40px; height: 38px; }
  .bar-note { flex: none; white-space: nowrap; }
  .collar { width: 4px; height: 16px; border-radius: 1px; background: var(--text-3); }
  .plate { width: var(--w); border-radius: 2px; background: linear-gradient(180deg, var(--ember-2), var(--ember)); box-shadow: 0 0 8px rgba(255, 90, 31, 0.35); }
  .bar-end { width: 14px; height: 5px; border-radius: 0 2px 2px 0; background: var(--text-3); }
</style>

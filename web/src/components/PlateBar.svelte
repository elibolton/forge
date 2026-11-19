<script lang="ts">
  import { platesPerSide } from '../lib/plates';
  import { fmtNum } from '../lib/units';

  /** What to put on each side of the bar, drawn as a little loaded sleeve. */
  let { total, bar, pounds }: { total: number; bar: number; pounds: boolean } = $props();
  const result = $derived(platesPerSide(total, bar, pounds));
  const biggest = $derived(pounds ? 45 : 25);
  const text = $derived(result.plates.length ? result.plates.map((p) => fmtNum(p, 2)).join(' + ') : 'Empty bar');
</script>

<div class="plates" aria-label="Per side: {text}{result.remainder ? `, plus ${fmtNum(result.remainder, 2)} you can't make with plates` : ''}">
  <div class="sleeve" aria-hidden="true">
    <span class="collar"></span>
    {#each result.plates as p, i (i)}<span class="plate" style="height:{10 + (p / biggest) * 26}px;--w:{p >= biggest * 0.5 ? 7 : 5}px"></span>{/each}
    <span class="bar-end"></span>
  </div>
  <div class="stack grow" style="--gap:2px">
    <span class="eyebrow">Each side</span>
    <span class="sub semibold mono">{text}</span>
  </div>
  <span class="caption faint">{fmtNum(bar)} {pounds ? 'lb' : 'kg'} bar{result.remainder ? ` · ${fmtNum(result.remainder, 2)} off` : ''}</span>
</div>

<style>
  .plates { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 16px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--hairline); }
  .sleeve { display: flex; align-items: center; gap: 2px; min-width: 40px; height: 38px; }
  .collar { width: 4px; height: 16px; border-radius: 1px; background: var(--text-3); }
  .plate { width: var(--w); border-radius: 2px; background: linear-gradient(180deg, var(--ember-2), var(--ember)); box-shadow: 0 0 8px rgba(255, 90, 31, 0.35); }
  .bar-end { width: 14px; height: 5px; border-radius: 0 2px 2px 0; background: var(--text-3); }
</style>
